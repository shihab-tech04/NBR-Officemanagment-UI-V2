import catalog from "./rulesSqlSnapshot.json";
import { SQL_RULE_GROUPS, TAX_YEAR_SNAPSHOT } from "./rulesEngineSnapshot";

/**
 * Evidence-preserving comparison of identities in the dated Office SQL snapshot.
 * This is NOT a comparison of law, formulas or historical year-complete rules.
 * Unsupported years intentionally return no inferred rule identities.
 */
export type SnapshotComparisonStatus =
  | "INHERITED_PENDING_REVIEW"
  | "LEGAL_DELTA_UNVERIFIED";

export interface SnapshotComparisonRule {
  id: string;
  groupId: string;
  groupEn: string;
  groupBn: string;
  baseAssessmentYear: string;
  targetAssessmentYear: string;
  baseExecution: string;
  targetExecution: string;
  status: SnapshotComparisonStatus;
  legalSources: string[];
  origin: string | null;
}

const completeIdentityInventory = (year: string) => {
  const observed = TAX_YEAR_SNAPSHOT.find((candidate) => candidate.assessmentYear === year);
  return !!observed &&
    observed.ruleVersions === catalog.expected_total &&
    (observed.coverage === "complete_canonical" || observed.coverage === "cloned_pending_review");
};

export function snapshotComparisonAvailable(baseYear: string, targetYear: string): boolean {
  return baseYear !== targetYear &&
    completeIdentityInventory(baseYear) &&
    completeIdentityInventory(targetYear);
}

export function snapshotCoverageReason(baseYear: string, targetYear: string): string {
  if (baseYear === targetYear) return "Select two different assessment years.";
  if (!TAX_YEAR_SNAPSHOT.some((year) => year.assessmentYear === baseYear) ||
      !TAX_YEAR_SNAPSHOT.some((year) => year.assessmentYear === targetYear)) {
    return "A selected assessment year has no controlled SQL observation.";
  }
  if (!snapshotComparisonAvailable(baseYear, targetYear)) {
    return "At least one year has incomplete historical identities. No current-year rule is copied backward to manufacture history.";
  }
  return "Both years contain the recorded identity inventory. Legal text, parameter and calculation differences are NOT VERIFIED.";
}

export function compareSnapshotIdentities(
  baseYear: string,
  targetYear: string,
  groupId = "",
  query = "",
): SnapshotComparisonRule[] {
  if (!snapshotComparisonAvailable(baseYear, targetYear)) return [];
  const q = query.trim().toLocaleLowerCase();
  return catalog.rules
    .filter((rule) => !groupId || rule.group === groupId)
    .filter((rule) => !q || [
      rule.id, rule.group, rule.origin ?? "", rule.source ?? "",
      ...(rule.legalSource ?? []).filter((item): item is string => typeof item === "string"),
    ].some((value) => value.toLocaleLowerCase().includes(q)))
    .map((rule) => {
      const group = SQL_RULE_GROUPS.find((item) => item.id === rule.group);
      const inherited = targetYear === "2027-28" || baseYear === "2027-28";
      return {
        id: rule.id,
        groupId: rule.group,
        groupEn: group?.en ?? rule.group,
        groupBn: group?.bn ?? rule.group,
        baseAssessmentYear: baseYear,
        targetAssessmentYear: targetYear,
        baseExecution: baseYear === "2027-28" ? "INHERITED_PENDING_REVIEW" : (rule.execution ?? "NOT_RECORDED"),
        targetExecution: targetYear === "2027-28" ? "INHERITED_PENDING_REVIEW" : (rule.execution ?? "NOT_RECORDED"),
        status: inherited ? "INHERITED_PENDING_REVIEW" : "LEGAL_DELTA_UNVERIFIED",
        legalSources: (rule.legalSource ?? []).filter((item): item is string => typeof item === "string"),
        origin: rule.origin ?? null,
      };
    });
}
