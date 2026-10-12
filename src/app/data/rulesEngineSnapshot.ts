/**
 * Read-only SQL inventory inspected on 2026-10-10 (Asia/Dhaka).
 * This is a dated observation, NOT a live SQL connection, new law,
 * legal certification or permission to activate an executable rule.
 */
export const RULES_SNAPSHOT_DATE = "2026-10-10";
export const RULES_BASELINE = "FINAL_2026_09_30";
export const RULES_BASELINE_SHA256 = "34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184";

export type GateCode = "source" | "period" | "version" | "impact" | "regression" | "unsafe" | "approval";
export type GateState = "PASS" | "BLOCKED" | "REQUIRED" | "NOT_RUN";
export type TaxYearState = "reference_only" | "active" | "draft";

export interface TaxYearObservation {
  assessmentYear: string;
  incomeYear: string;
  dbState: TaxYearState;
  coverage: string;
  lifecycle: string;
  executableFlag: boolean;
  immutable: boolean;
  legalCutoff: string | null;
  ruleVersions: number;
  inheritedPending: number;
  gates: Partial<Record<GateCode, GateState>>;
}

export const TAX_YEAR_SNAPSHOT: TaxYearObservation[] = [
  { assessmentYear: "2024-25", incomeYear: "2023-24", dbState: "reference_only", coverage: "incomplete_historical", lifecycle: "REFERENCE", executableFlag: false, immutable: true, legalCutoff: null, ruleVersions: 0, inheritedPending: 0, gates: {} },
  { assessmentYear: "2025-26", incomeYear: "2024-25", dbState: "reference_only", coverage: "incomplete_historical", lifecycle: "REFERENCE", executableFlag: false, immutable: true, legalCutoff: null, ruleVersions: 1, inheritedPending: 0, gates: {} },
  { assessmentYear: "2026-27", incomeYear: "2025-26", dbState: "active", coverage: "complete_canonical", lifecycle: "ACTIVE", executableFlag: true, immutable: true, legalCutoff: "2026-09-30", ruleVersions: 366, inheritedPending: 0, gates: {source:"PASS",period:"PASS",version:"PASS",impact:"PASS",regression:"PASS",unsafe:"PASS",approval:"PASS"} },
  { assessmentYear: "2027-28", incomeYear: "2026-27", dbState: "draft", coverage: "cloned_pending_review", lifecycle: "LEGAL_CHANGE_INTAKE", executableFlag: false, immutable: false, legalCutoff: null, ruleVersions: 366, inheritedPending: 366, gates: {source:"REQUIRED",period:"REQUIRED",version:"REQUIRED",impact:"NOT_RUN",regression:"NOT_RUN",unsafe:"REQUIRED",approval:"BLOCKED"} },
];

export interface SqlRuleGroup {
  id: string;
  en: string;
  bn: string;
  count: number;
}
export const SQL_RULE_GROUPS: SqlRuleGroup[] = [
  {id:"individual-return", en:"Individual Return & Income",bn:"ব্যক্তি রিটার্ন ও আয়",count:7},
  {id:"corporate-business",en:"Corporate & Business",bn:"কোম্পানি ও ব্যবসা",count:58},
  {id:"withholding-advance-tax",en:"Withholding & Advance Tax",bn:"উৎসে কর ও অগ্রিম কর",count:188},
  {id:"rebate-exemption",en:"Rebate, Exemption & Benefit",bn:"রেয়াত, অব্যাহতি ও সুবিধা",count:96},
  {id:"nonresident-treaty",en:"Non-Resident & Treaty",bn:"অনিবাসী ও কর-চুক্তি",count:0},
  {id:"assessment-audit",en:"Assessment, Audit & Compliance",bn:"অ্যাসেসমেন্ট, অডিট ও কমপ্লায়েন্স",count:6},
  {id:"payment-refund",en:"Payment, Credit & Refund",bn:"পরিশোধ, ক্রেডিট ও রিফান্ড",count:1},
  {id:"forms-evidence-admin",en:"Forms, Evidence & Administration",bn:"ফর্ম, প্রমাণ ও প্রশাসন",count:10},
  {id:"other",en:"Other / Cross-Cutting",bn:"অন্যান্য / ক্রস-কাটিং",count:0},
];

/** Independent legal/Agent hard gate is not superseded by historic SQL PASS flags. */
export function isCertifiedForEngineExecution(_year: TaxYearObservation): boolean {
  return false;
}

export function canPublishOrExecuteRule(_year: TaxYearObservation, _ruleExecutionStatus?: string): boolean {
  // Fail-closed until new, independent legally reviewed authorization + runtime tests.
  return false;
}

export const GATE_CODES: GateCode[] = ["source", "period", "version", "impact", "regression", "unsafe", "approval"];
