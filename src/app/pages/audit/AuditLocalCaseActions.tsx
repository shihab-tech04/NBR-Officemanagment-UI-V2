import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TableRow } from "../modulePageUtils";
import { getAuditCandidates } from "./auditCandidateStore";
import {
  decideLocalAuditReview, getLocalAuditCase, recordLocalAuditEvidence,
  submitLocalAuditFinding, verifyLocalAuditEvidence,
  type LocalAuditEvidence,
} from "./auditLocalCaseWorkflow";
import { AppModal } from "../../components/modals/AppModal";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextField } from "../../components/forms/AppTextField";
import { AppTextArea } from "../../components/forms/AppTextArea";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { useSettings } from "../../hooks/useSettings";

type Action = "record" | "verify" | "finding" | "sign_off" | "request_rework";
export function AuditLocalCaseActions({
  row, mode,
}: { row: TableRow | null; mode: "evidence" | "review" }) {
  const { i18n } = useTranslation();
  const { assessmentYear } = useSettings();
  const bn = i18n.resolvedLanguage?.startsWith("bn");
  const candidate = row ? getAuditCandidates().find((item) =>
    item.return_id === String(row.return_id ?? "") &&
    item.assessment_year === assessmentYear) : undefined;
  const [action, setAction] = useState<Action | null>(null);
  const [signal, setSignal] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [attachment, setAttachment] = useState<LocalAuditEvidence["attachment"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [revision, setRevision] = useState(0);
  if (!candidate) return null;
  const caseState = getLocalAuditCase(candidate.candidate_id);
  const signals = [...new Set(String(candidate.signals).match(/R-[A-E]\d/g) ?? [])];
  const pending = caseState.evidence.filter((item) => item.verification === "Pending");
  const verified = caseState.evidence.filter((item) => item.verification === "Verified");
  const covered = signals.length > 0 && signals.every((code) => verified.some((item) => item.signal === code));
  const activeFinding = [...caseState.findings].reverse().find((item) => !item.superseded);
  const mayVerify = !["Not Started","Closed"].includes(candidate.audit_status);
  const mayFind = ["Verifying","Evidence Pending","Ready for Review"].includes(candidate.audit_status);
  const mayReview = ["Ready for Review","Second Review"].includes(candidate.audit_status) && !!activeFinding;
  const label = (en: string, bangla: string) => bn ? bangla : en;
  const names: Record<Action, string> = {
    record: label("Record evidence", "প্রমাণ যুক্ত করুন"),
    verify: label("Verify evidence", "প্রমাণ যাচাই করুন"),
    finding: label("Submit Finding", "ফাইন্ডিং জমা দিন"),
    sign_off: label("Sign off", "পর্যালোচনা সম্পন্ন করুন"),
    request_rework: label("Request rework", "পুনরায় যাচাই করতে বলুন"),
  };
  const start = (next: Action) => {
    if (busy) return;
    setAction(next);
    setReference("");
    setSignal(signals[0] ?? "");
    setReason("");
    setEvidenceId(pending[0]?.id ?? "");
    setAttachment(undefined);
    setError("");
  };
  const close = () => { if (!busy) setAction(null); };
  const submit = () => {
    if (!action || inFlight.current || !candidate) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "record") {
        recordLocalAuditEvidence(candidate.candidate_id, signal, reference, reason, attachment);
      } else if (action === "verify") {
        verifyLocalAuditEvidence(candidate.candidate_id, evidenceId, reason);
      } else if (action === "finding") {
        submitLocalAuditFinding(candidate.candidate_id, reason);
      } else {
        decideLocalAuditReview(candidate.candidate_id, action, reason);
      }
      toast.success(label("Audit record saved and verified on this device.", "অডিট রেকর্ড এই ডিভাইসে সংরক্ষিত হয়েছে।"));
      setAction(null);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit action could not be saved");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const handleFile = (file: File | undefined) => {
    if (!file) { setAttachment(undefined); return; }
    if (file.size > 1_400_000 || !["application/pdf","image/jpeg","image/png"].includes(file.type)) {
      setError(label("Choose a PDF, JPG or PNG under 1.4 MB.", "১.৪ এমবির কম PDF, JPG বা PNG ফাইল নির্বাচন করুন।"));
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onerror = () => setError(label("File could not be read.", "ফাইলটি পড়া যায়নি।"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachment({ name: file.name, mime: file.type, dataUrl: reader.result });
        setReference((value) => value || file.name);
      }
    };
    reader.readAsDataURL(file);
  };
  const download = (item: LocalAuditEvidence) => {
    if (!item.attachment) return;
    const link = document.createElement("a");
    link.href = item.attachment.dataUrl;
    link.download = item.attachment.name;
    link.click();
  };
  const controls = mode === "evidence" ? (
    <>
      {mayVerify && signals.length > 0 && (
        <SecondaryButton size="sm" onClick={() => start("record")}>{names.record}</SecondaryButton>
      )}
      {pending.length > 0 && mayVerify && (
        <SecondaryButton size="sm" onClick={() => start("verify")}>{names.verify}</SecondaryButton>
      )}
      {covered && mayFind && (
        <PrimaryButton size="sm" onClick={() => start("finding")}>{names.finding}</PrimaryButton>
      )}
    </>
  ) : mayReview ? (
    <>
      <SecondaryButton size="sm" onClick={() => start("request_rework")}>{names.request_rework}</SecondaryButton>
      <PrimaryButton size="sm" onClick={() => start("sign_off")}>{names.sign_off}</PrimaryButton>
    </>
  ) : null;
  // The component is mounted in the existing approved DetailsDrawer footer.
  return (
    <>
      {revision >= 0 && controls}
      {mode === "evidence" && caseState.evidence.filter((item) => !!item.attachment).map((item) => (
        <SecondaryButton key={item.id} size="sm" onClick={() => download(item)}>
          {label("Document", "নথি")}: {item.reference}
        </SecondaryButton>
      ))}
      <AppModal
        open={action !== null}
        size="md"
        layer="top"
        title={action ? names[action] : ""}
        onClose={close}
        footer={
          <>
            <SecondaryButton size="sm" disabled={busy} onClick={close}>{label("Cancel","বাতিল")}</SecondaryButton>
            <PrimaryButton size="sm" loading={busy} disabled={busy || !reason.trim()} onClick={submit}>
              {label("Save","সংরক্ষণ")}
            </PrimaryButton>
          </>
        }
      >
        <div className="form-stack">
          <p>{candidate.taxpayer_name} · {candidate.return_id} · {candidate.audit_status}</p>
          {action === "record" && (
            <>
              <AppSelectField id="local-audit-signal" label={label("Risk signal","ঝুঁকির সংকেত")}
                value={signal} onChange={setSignal} options={signals} required />
              <AppTextField id="local-audit-reference" label={label("Document or certificate reference","নথি বা সনদের রেফারেন্স")}
                value={reference} onChange={setReference} required />
              <label htmlFor="local-audit-attachment">
                {label("Attach PDF or image (optional, up to 1.4 MB)", "PDF বা ছবি সংযুক্ত করুন (ঐচ্ছিক, সর্বোচ্চ ১.৪ এমবি)")}
              </label>
              <input id="local-audit-attachment" type="file" accept="application/pdf,image/png,image/jpeg"
                disabled={busy} onChange={(event) => handleFile(event.target.files?.[0])} />
              {attachment && <p role="status">{attachment.name}</p>}
            </>
          )}
          {action === "verify" && (
            <AppSelectField id="local-audit-evidence" label={label("Pending evidence","অপেক্ষমাণ প্রমাণ")}
              value={evidenceId} onChange={setEvidenceId}
              options={pending.map((item) => ({value:item.id,label:item.signal + " · " + item.reference}))}
              required />
          )}
          {action === "finding" && (
            <p>{label("Verified signals","যাচাইকৃত সংকেত")}: {signals.join(", ")} ·
              {label(" evidence records"," প্রমাণের রেকর্ড")}: {verified.length}</p>
          )}
          {(action === "sign_off" || action === "request_rework") && activeFinding && (
            <p><strong>{activeFinding.signal_codes.join(", ")}</strong> · {activeFinding.summary}</p>
          )}
          <AppTextArea id="local-audit-reason"
            label={action === "finding"
              ? label("Evidence-based Finding","প্রমাণভিত্তিক ফাইন্ডিং")
              : label("Specific verification or review note","যাচাই বা পর্যালোচনার সুনির্দিষ্ট কারণ")}
            value={reason} onChange={setReason} required rows={4}
            helper={action === "finding" || action === "sign_off" || action === "request_rework"
              ? label("20–2000 characters","২০–২০০০ অক্ষর")
              : label("10–1000 characters","১০–১০০০ অক্ষর")}
            error={error || undefined}
          />
          {error && <p role="alert">{error}</p>}
        </div>
      </AppModal>
    </>
  );
}
