-- F-177 / US-180: additive Office Taxpayer 360 ledger contract.
-- Preserve the existing independent Office mirror; never manufacture credit from
-- a simulated payment, and never imply an unconnected provider is integrated.
BEGIN;
CREATE SCHEMA IF NOT EXISTS office_ledger_private;
REVOKE ALL ON SCHEMA office_ledger_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA office_ledger_private TO service_role;
CREATE TABLE office_ledger_private.source_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_system text NOT NULL CHECK (source_system IN
  ('BRTA','E_TDS','IBAS_PLUS_PLUS','NSD','SUB_REGISTRAR_OFFICE','BANK','SA_CODER')),
 source_record_id text NOT NULL CHECK (length(btrim(source_record_id))>0),
 source_allocation_id text,
 source_revision bigint NOT NULL DEFAULT 1 CHECK (source_revision>0),
 taxpayer_tin text NOT NULL CHECK (taxpayer_tin ~ '^[0-9]{12}$'),
 dhara text, payment_source text NOT NULL,
 amount_minor bigint NOT NULL CHECK (amount_minor>=0),
 assessment_year text, event_date timestamptz NOT NULL,
 original_reference text, entry_kind text NOT NULL CHECK
  (entry_kind IN ('DEDUCTION','DEPOSIT','CREDIT','REVERSAL')),
 verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK
  (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','REVERSED')),
 evidence_sha256 text, canonical_credit_ref text,
 canonical_credit_line_id text,
 reconciliation_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
 received_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT external_source_revision_unique UNIQUE NULLS NOT DISTINCT
   (source_system,source_record_id,source_allocation_id,source_revision),
 CONSTRAINT official_evidence_before_verification CHECK (
   verification_status<>'VERIFIED' OR
   (evidence_sha256 ~ '^[0-9a-f]{64}$' AND
    reconciliation_provenance ? 'officialSourceRecordId'
    AND reconciliation_provenance ? 'verifiedAt')
 ),
 CONSTRAINT verified_credit_reference_required CHECK (
   verification_status<>'VERIFIED' OR entry_kind<>'CREDIT' OR
   (NULLIF(btrim(canonical_credit_ref),'') IS NOT NULL AND
    NULLIF(btrim(canonical_credit_line_id),'') IS NOT NULL))
);
ALTER TABLE office_ledger_private.source_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE office_ledger_private.source_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE office_ledger_private.source_events TO service_role;
CREATE INDEX source_events_taxpayer_latest ON office_ledger_private.source_events
 (taxpayer_tin,source_system,source_record_id,source_revision DESC);
-- An authorized importer must provide a stable canonical credit reference
-- AND canonical line identity. Multiple taxpayers on one combined challan
-- may each have a distinct credit line, but cross-provider replay of the
-- *same* canonical line cannot inflate the verified total.
CREATE UNIQUE INDEX external_verified_credit_once
 ON office_ledger_private.source_events(canonical_credit_ref,canonical_credit_line_id)
 WHERE verification_status='VERIFIED' AND entry_kind='CREDIT';

-- Corrections and reversals are new source revisions, never edits to evidence.
CREATE FUNCTION office_ledger_private.reject_source_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $immutable$
BEGIN
 RAISE EXCEPTION 'EXTERNAL_LEDGER_EVENT_IMMUTABLE';
END;
$immutable$;
CREATE TRIGGER source_events_immutable_before_change
 BEFORE UPDATE OR DELETE ON office_ledger_private.source_events
 FOR EACH ROW EXECUTE FUNCTION office_ledger_private.reject_source_event_mutation();
REVOKE ALL ON FUNCTION office_ledger_private.reject_source_event_mutation()
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.payment_v1_office_guarded_taxpayer_ledger(
 p_taxpayer_tin text,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $guarded_ledger$
DECLARE
 v_actor uuid:=auth.uid(); v_origin text; v_items jsonb; v_credits numeric:=0;
BEGIN
 SELECT s.origin INTO v_origin FROM payment_sync.settings s WHERE s.singleton;
 IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL' OR
    NOT EXISTS (SELECT 1 FROM payment_sync.officer_roles r
      WHERE r.user_uid=v_actor AND r.active
        AND r.role IN ('MAKER','REVIEWER','APPROVER'))
 THEN RAISE EXCEPTION 'Active authorized Office payment officer required'
   USING ERRCODE='42501'; END IF;
 IF p_taxpayer_tin IS NULL OR p_taxpayer_tin !~ '^[0-9]{12}$'
 THEN RAISE EXCEPTION 'Valid taxpayer TIN required'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>200
    OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
 THEN RAISE EXCEPTION 'Invalid ledger page'; END IF;
 WITH external_latest AS (
   SELECT DISTINCT ON (e.source_system,e.source_record_id,e.source_allocation_id)
    e.* FROM office_ledger_private.source_events e
   WHERE e.taxpayer_tin=p_taxpayer_tin
   ORDER BY e.source_system,e.source_record_id,e.source_allocation_id,
     e.source_revision DESC
 ), mirror_lines AS (
   SELECT p.id, p.service_code,p.amount_minor,p.status,p.created_at,p.data,
     l.value AS line,
     CASE WHEN pg_catalog.jsonb_typeof(p.data#>'{details,allocations}')='array'
       THEN pg_catalog.jsonb_array_length(p.data#>'{details,allocations}')>0
       ELSE false END AS has_allocations
   FROM demo_payment.story_payments p
   CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    CASE WHEN pg_catalog.jsonb_typeof(p.data#>'{details,allocations}')='array'
         THEN p.data#>'{details,allocations}'
         ELSE pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
           'taxpayerTin',p.data#>>'{details,taxpayerTin}')) END
   ) AS l(value)
   WHERE p.data->>'origin'='TAXPAY_UI'
 ), ledger_rows AS (
   SELECT e.event_date AS occurred_at,
    pg_catalog.jsonb_build_object(
      'sourceSystem',e.source_system,'sourceRecordId',e.source_record_id,
      'sourceAllocationId',e.source_allocation_id,
      'sourceRevision',e.source_revision,'taxpayerTin',e.taxpayer_tin,
      'dhara',e.dhara,'paymentSource',e.payment_source,
      'amountMinor',e.amount_minor::text,'assessmentYear',e.assessment_year,
      'eventDate',e.event_date,'originalReference',e.original_reference,
      'entryKind',e.entry_kind,'financialStatus',e.verification_status,
      'reconciliationProvenance',e.reconciliation_provenance,
      'evidenceSha256',e.evidence_sha256,
      'canonicalCreditReference',e.canonical_credit_ref,
      'canonicalCreditLineId',e.canonical_credit_line_id
    ) AS item
   FROM external_latest e
   UNION ALL
   SELECT m.created_at AS occurred_at,
    pg_catalog.jsonb_build_object(
      'sourceSystem','SOHOJKOR','sourceRecordId',m.id::text,
      'sourceAllocationId',m.line->>'allocationId',
      'sourceRevision',1,'taxpayerTin',m.line->>'taxpayerTin',
      'dhara',m.line->>'dhara','paymentSource','Sohojkor',
      'amountMinor',CASE WHEN m.has_allocations THEN m.line->>'amountMinor'
         ELSE m.amount_minor::text END,
      'assessmentYear',coalesce(m.line->>'assessmentYear',
        m.data#>>'{details,assessmentYear}'),
      'eventDate',m.created_at,
      'originalReference',m.data#>>'{details,receiptReference}',
      'entryKind','PAYMENT_RECORD','financialStatus','UNVERIFIED',
      'sourcePaymentId',m.data#>>'{details,sourcePaymentId}',
      'sourceStatus',m.status,
      'reconciliationProvenance',pg_catalog.jsonb_build_object(
         'officeMirror',true,'treasuryCreditVerified',false)
    ) AS item
   FROM mirror_lines m WHERE m.line->>'taxpayerTin'=p_taxpayer_tin
 )
 SELECT coalesce(pg_catalog.jsonb_agg(ordered.item ORDER BY
   ordered.occurred_at DESC,ordered.item->>'sourceRecordId'), '[]'::jsonb)
 INTO v_items FROM (
   SELECT * FROM ledger_rows
   ORDER BY occurred_at DESC,item->>'sourceRecordId'
   LIMIT p_limit OFFSET p_offset
 ) ordered;
 -- Never credit simulated Sohojkor parents, unverified external records,
 -- or source deductions/deposits. Deduplicate external source revisions first.
 SELECT coalesce(pg_catalog.sum(e.amount_minor),0) INTO v_credits
 FROM (
   SELECT DISTINCT ON (source_system,source_record_id,source_allocation_id)
     entry_kind,verification_status,amount_minor
   FROM office_ledger_private.source_events
   WHERE taxpayer_tin=p_taxpayer_tin
   ORDER BY source_system,source_record_id,source_allocation_id,source_revision DESC
 ) e
 WHERE e.entry_kind='CREDIT' AND e.verification_status='VERIFIED';
 RETURN pg_catalog.jsonb_build_object(
   'items',v_items,'limit',p_limit,'offset',p_offset,
   'verifiedExternalCreditMinor',v_credits::text,
   'mirroredSohojkorCreditVerified',false
 );
END;
$guarded_ledger$;
REVOKE ALL ON FUNCTION public.payment_v1_office_guarded_taxpayer_ledger(text,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_guarded_taxpayer_ledger(text,integer,integer)
 TO authenticated;
COMMENT ON FUNCTION public.payment_v1_office_guarded_taxpayer_ledger(text,integer,integer) IS
 'F-177: active Office officer-only immutable source lines. Original Sohojkor simulated records remain unverified; external verified credit requires source evidence. Unsupported provider connectors are not operational.';
COMMIT;
