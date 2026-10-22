/**
 * UI-only legal intake model.  Never conflates a staged proposal with approved
 * tax law, database persistence, or an executable rules engine.
 * Periods and canonical identities are always selected from verified snapshots.
 */
import { RULES_BASELINE, RULES_BASELINE_SHA256 } from "./rulesEngineSnapshot";

export type CandidateLegalEffect = "UNVERIFIED" | "ADDITION" | "AMENDMENT" | "SUBSTITUTION" | "REPEAL" | "COMMENCEMENT" | "SAVINGS" | "CONFLICT";
export type CandidateImpact = "rules" | "forms" | "ux" | "calculation" | "api" | "database" | "eledger" | "tests" | "office" | "ereturn" | "sql" | "validation";

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
/** Proposed legal links remain human-review-only even when a PDF checksum matches. */
export type DraftRuleLevel = "PARENT" | "SUBRULE" | "CHILD";
export type DraftHierarchyBasis = "STATUTORY" | "ADMINISTRATIVE";
export interface DraftProvisionCandidate {
  proposalId: string;
  ruleId: string;
  parentRuleId: string;
  level: DraftRuleLevel;
  hierarchyBasis: DraftHierarchyBasis;
  sourceId: string;
  sourcePdfSha256: string;
  provisionLocator: string;
  previousText: string;
  proposedText: string;
  issueDate: string;
  effectiveDate: string;
  savingsText: string;
  taxpayerScope: string;
  triggeringFacts: string;
  rateOrFormula: string;
  exemptionOrException: string;
  impacts: CandidateImpact[];
  reviewState: "PROPOSED" | "CONFLICT";
}
export function freshProvisionCandidate(): DraftProvisionCandidate {
  return {
    proposalId: "", ruleId: "", parentRuleId: "", level: "PARENT", hierarchyBasis: "STATUTORY",
    sourceId: "", sourcePdfSha256: "", provisionLocator: "", previousText: "", proposedText: "",
    issueDate: "", effectiveDate: "", savingsText: "", taxpayerScope: "",
    triggeringFacts: "", rateOrFormula: "", exemptionOrException: "",
    impacts: [], reviewState: "PROPOSED",
  };
}
export interface TaxYearDraftInput {
  targetYear: string;
  incomeYear: string;
  baseYear: string;
  legalCutoff: string;
  taxpayerScope: string;
  selectedRuleIds: string[];
  customRules: DraftCustomRule[];
  proposedProvisions: DraftProvisionCandidate[];
  documents: DraftDocumentEvidence[];
  legalEffect: CandidateLegalEffect;
  changeNote: string;
  proposedImpacts: CandidateImpact[];
}

export const DRAFT_YEAR_TARGET = "2027-28";
export const DRAFT_INCOME_YEAR = "2026-27";
export const DRAFT_BASE_YEAR = "2026-27";
export const CANDIDATE_IMPACTS: CandidateImpact[] = ["rules", "forms", "ux", "calculation", "api", "database", "eledger", "tests", "office", "ereturn", "sql", "validation"];
export const LEGAL_EFFECTS: CandidateLegalEffect[] = ["UNVERIFIED", "ADDITION", "AMENDMENT", "SUBSTITUTION", "REPEAL", "COMMENCEMENT", "SAVINGS", "CONFLICT"];

export function freshDraftInput(): TaxYearDraftInput {
  return {
    targetYear: DRAFT_YEAR_TARGET,
    incomeYear: DRAFT_INCOME_YEAR,
    baseYear: DRAFT_BASE_YEAR,
    legalCutoff: "",
    taxpayerScope: "",
    selectedRuleIds: [],
    customRules: [],
    proposedProvisions: [],
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
  const provisions = input.proposedProvisions ?? [];
  const proposalIds = new Set<string>();
  const allowedRuleIds = new Set([...canonicalIds, ...input.customRules.map(rule => rule.candidateId)]);
  const controlledPdfHashes = new Set(input.documents.filter(doc => doc.type === "PDF").map(doc => doc.sha256));
  for (const proposed of provisions) {
    if (!/^[A-Z][A-Z0-9-]{3,63}$/.test(proposed.proposalId) || proposalIds.has(proposed.proposalId))
      throw new Error("Invalid or duplicate provision proposal ID");
    proposalIds.add(proposed.proposalId);
    if (!allowedRuleIds.has(proposed.ruleId) ||
        (proposed.parentRuleId && !allowedRuleIds.has(proposed.parentRuleId)) ||
        proposed.parentRuleId === proposed.ruleId ||
        !["PARENT", "SUBRULE", "CHILD"].includes(proposed.level) ||
        !["STATUTORY", "ADMINISTRATIVE"].includes(proposed.hierarchyBasis))
      throw new Error("Invalid proposed hierarchy or unmatched rule identity");
    if (!controlledPdfHashes.has(proposed.sourcePdfSha256) ||
        !proposed.sourceId.trim() || !proposed.provisionLocator.trim() ||
        !(proposed.previousText.trim() || proposed.proposedText.trim()))
      throw new Error("A proposed provision requires a linked original PDF, source ID, locator and text");
    if ([proposed.issueDate, proposed.effectiveDate].some(date => date && !/^\d{4}-\d{2}-\d{2}$/.test(date)))
      throw new Error("Invalid proposed provision date");
    if (proposed.impacts.some(impact => !CANDIDATE_IMPACTS.includes(impact)) ||
        !["PROPOSED", "CONFLICT"].includes(proposed.reviewState))
      throw new Error("Invalid proposed impact or review state");
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
    reviewPackageRevision: "LOCAL_DRAFT_V2",
    yearState: "DRAFT",
    inheritedApplicability: "INHERITED_PENDING_REVIEW",
    taxpayerScope: input.taxpayerScope.trim() || "NOT_VERIFIED",
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
    provisionCandidates: provisions.map(p => ({
      ...p, impacts: [...p.impacts], legalVerified: false as const, sqlVersionId: null,
      persistence: "LOCAL_REVIEW_ONLY" as const, gapState: "OPEN" as const,
    })),
    coverageReconciliation: { state: "OPEN" as const, sqlVersionsVerified: 0, agentLocatorsVerified: 0, unmatchedItemsVisible: true },
    legalComparison: { proposedEffect: input.legalEffect, reviewNotes: input.changeNote.trim(), result: "HUMAN_REVIEW_REQUIRED", verifiedAmendment: false },
    impactReview: CANDIDATE_IMPACTS.map(type => ({ target: type, status: "OPEN" as const, candidate: input.proposedImpacts.includes(type) })),
    releaseGate: { result: "BLOCKED", reason: "Current law, official originals, source applicability, agent tests, SQL read-back and approval must be independently certified" },
  };
}
