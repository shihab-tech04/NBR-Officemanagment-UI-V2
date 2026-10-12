/**
 * UI-only legal intake model.  Never conflates a staged proposal with approved
 * tax law, database persistence, or an executable rules engine.
 * Periods and canonical identities are always selected from verified snapshots.
 */
import { RULES_BASELINE, RULES_BASELINE_SHA256 } from "./rulesEngineSnapshot";

export type CandidateLegalEffect = "UNVERIFIED" | "ADDITION" | "SUBSTITUTION" | "REPEAL" | "SAVINGS" | "CONFLICT";
export type CandidateImpact = "rules" | "forms" | "ux" | "calculation" | "api" | "database" | "eledger" | "tests";

export interface DraftDocumentEvidence {
  name: string;
  type: "PDF" | "JSON";
  sizeBytes: number;
  sha256: string;
  officialUrl: string;
  suppliedIssueDate: string;
  suppliedCommencementDate: string;
  evidenceStatus: "UNVERIFIED";
  persisted: false;
}
export interface DraftCustomRule {
  candidateId: string;
  purpose: string;
  status: "PROPOSED";
}
export interface TaxYearDraftInput {
  targetYear: string;
  incomeYear: string;
  baseYear: string;
  legalCutoff: string;
  selectedRuleIds: string[];
  customRules: DraftCustomRule[];
  documents: DraftDocumentEvidence[];
  legalEffect: CandidateLegalEffect;
  changeNote: string;
  proposedImpacts: CandidateImpact[];
}

export const DRAFT_YEAR_TARGET = "2027-28";
export const DRAFT_INCOME_YEAR = "2026-27";
export const DRAFT_BASE_YEAR = "2026-27";
export const CANDIDATE_IMPACTS: CandidateImpact[] = ["rules", "forms", "ux", "calculation", "api", "database", "eledger", "tests"];
export const LEGAL_EFFECTS: CandidateLegalEffect[] = ["UNVERIFIED", "ADDITION", "SUBSTITUTION", "REPEAL", "SAVINGS", "CONFLICT"];

export function freshDraftInput(): TaxYearDraftInput {
  return {
    targetYear: DRAFT_YEAR_TARGET,
    incomeYear: DRAFT_INCOME_YEAR,
    baseYear: DRAFT_BASE_YEAR,
    legalCutoff: "",
    selectedRuleIds: [],
    customRules: [],
    documents: [],
    legalEffect: "UNVERIFIED",
    changeNote: "",
    proposedImpacts: [],
  };
}

export function isSupportedDraftYear(input: Pick<TaxYearDraftInput, "targetYear" | "incomeYear" | "baseYear">): boolean {
  return input.targetYear === DRAFT_YEAR_TARGET && input.incomeYear === DRAFT_INCOME_YEAR && input.baseYear === DRAFT_BASE_YEAR;
}

export function isValidCustomRuleId(id: string, existingIds: ReadonlySet<string>, proposed: DraftCustomRule[]): boolean {
  return /^[A-Z][A-Z0-9-]{3,63}$/.test(id) && !existingIds.has(id) && !proposed.some(r => r.candidateId === id);
}

export function createDraftReviewPackage(input: TaxYearDraftInput, canonicalIds: ReadonlySet<string>) {
  if (!isSupportedDraftYear(input)) throw new Error("Assessment, income and source-year pair must match the controlled SQL snapshot");
  if (input.selectedRuleIds.some(id => !canonicalIds.has(id))) throw new Error("Unrecognized canonical rule identity");
  if (new Set(input.selectedRuleIds).size !== input.selectedRuleIds.length) throw new Error("Duplicate canonical rule identity");
  const candidates = new Set<string>();
  for (const rule of input.customRules) {
    if (!isValidCustomRuleId(rule.candidateId, canonicalIds, []) || candidates.has(rule.candidateId) || !rule.purpose.trim()) {
      throw new Error("Invalid or duplicate custom rule proposal");
    }
    candidates.add(rule.candidateId);
  }
  if (input.legalCutoff && !/^\d{4}-\d{2}-\d{2}$/.test(input.legalCutoff)) throw new Error("Invalid cutoff date format");
  if (input.documents.some(doc => !/^[a-f0-9]{64}$/.test(doc.sha256) || doc.evidenceStatus !== "UNVERIFIED" || doc.persisted !== false)) {
    throw new Error("Document metadata is invalid or improperly approved");
  }
  if (!LEGAL_EFFECTS.includes(input.legalEffect)) throw new Error("Unrecognized proposed legal effect");
  if (input.proposedImpacts.some(impact => !CANDIDATE_IMPACTS.includes(impact))) throw new Error("Unknown impact type");

  return {
    schema: "NBR_TAX_YEAR_INTAKE_REVIEW_DRAFT_V1",
    artifactKind: "LOCAL_REVIEW_EXPORT_NOT_SQL_RECORD",
    target: { assessmentYear: input.targetYear, incomeYear: input.incomeYear, sourceAssessmentYear: input.baseYear, userSuppliedLegalCutoff: input.legalCutoff || null },
    canonicalParent: { version: RULES_BASELINE, sha256: RULES_BASELINE_SHA256, originalUntouched: true, frozenIdentities: 366 },
    yearState: "DRAFT",
    inheritedApplicability: "INHERITED_PENDING_REVIEW",
    verificationStatus: "UNVERIFIED",
    executionStatus: "NOT_CERTIFIED",
    approvalsInherited: false,
    persistentSqlWritePerformed: false,
    approvedForPublication: false,
    reviewSelection: {
      canonicalRuleIds: [...input.selectedRuleIds].sort(),
      customRuleProposals: input.customRules.map(x => ({ candidateId: x.candidateId, purpose: x.purpose.trim(), status: "PROPOSED" as const })),
    },
    sourceDocuments: input.documents.map(doc => ({ ...doc, evidenceStatus: "UNVERIFIED" as const, persisted: false as const })),
    legalComparison: { proposedEffect: input.legalEffect, reviewNotes: input.changeNote.trim(), result: "HUMAN_REVIEW_REQUIRED", verifiedAmendment: false },
    impactReview: CANDIDATE_IMPACTS.map(type => ({ target: type, status: "OPEN" as const, candidate: input.proposedImpacts.includes(type) })),
    releaseGate: { result: "BLOCKED", reason: "Current law, official originals, source applicability, agent tests, SQL read-back and approval must be independently certified" },
  };
}
