/**
 * Register-4 MoM (2026-10-08), statutory-reference selection only.
 * This catalog is a UI convenience, NOT proof of current-law applicability.
 * Custom sections remain local drafts pending source verification.
 */
export const REGISTER4_SECTIONS = [
  { code: "180", en: "Self-assessment return", bn: "স্বনির্ধারণী রিটার্ন" },
  { code: "180(2)", en: "Revised self-assessment return", bn: "সংশোধিত স্বনির্ধারণী রিটার্ন" },
  { code: "182", en: "Audit selection / proceedings", bn: "অডিট নির্বাচন / কার্যক্রম" },
  { code: "183(7)", en: "Assessment order", bn: "কর নির্ধারণ আদেশ" },
  { code: "184", en: "Best-judgement assessment", bn: "সর্বোত্তম বিবেচনায় কর নির্ধারণ" },
  { code: "212", en: "Escaped tax proceedings", bn: "বাদ পড়া কর সংক্রান্ত কার্যক্রম" },
  { code: "213", en: "Revenue-prejudicial order revision", bn: "রাজস্বস্বার্থহানিকর আদেশ পুনর্বিবেচনা" },
  { code: "285", en: "Revision on taxpayer application", bn: "করদাতার আবেদনে পুনর্বিবেচনা" },
  { code: "289", en: "Appellate authority decision", bn: "আপিল কর্তৃপক্ষের সিদ্ধান্ত" },
  { code: "292", en: "Appellate Tribunal disposal", bn: "আপিল ট্রাইব্যুনালের নিষ্পত্তি" },
] as const;

export function normalizeRegister4SectionCode(input: string): string {
  return input.trim().replace(/[০-৯]/g, digit => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .replace(/\s+/g, "");
}

/** Format validation only: not legal authorization or year-specific eligibility. */
export function isRegister4SectionSyntax(input: string): boolean {
  return /^[1-9][0-9]{0,3}(?:\([1-9][0-9]{0,2}\))*$/.test(normalizeRegister4SectionCode(input));
}

export function register4SectionTrail(value: string): string[] {
  return value ? value.split("/").filter(Boolean) : [];
}

export function appendRegister4Section(trail: string, section: string): string | null {
  const code = normalizeRegister4SectionCode(section);
  if (!isRegister4SectionSyntax(code)) return null;
  return [...register4SectionTrail(trail), code].join("/");
}

// Synthetic display examples only, based on the slash-separated Register-4
// notation in the 2026-10-08 meeting reference and the available sections.
// THESE ARE NOT VERIFIED CASE HISTORIES, LEGAL PRESCRIPTIONS, OR CALCULATIONS.
// Never transfer these samples to an actual taxpayer or assessment record.
export const REGISTER4_ILLUSTRATIVE_SECTION_TRAILS = [
  "180/182(2)/182(4)/183(7)/289",
  "180",
  "180/180(2)",
  "180/182/183(7)",
  "180/182/184",
  "180/212/183(7)",
  "183(7)/289/292",
  "183(7)/213",
] as const;

/** Fixture is laid out in four AY groups; this rotates visible examples by taxpayer. */
export function illustrativeRegister4Trail(index: number): string {
  return REGISTER4_ILLUSTRATIVE_SECTION_TRAILS[Math.floor(index / 4) % REGISTER4_ILLUSTRATIVE_SECTION_TRAILS.length];
}

/** Test fixture shortcuts, not inferred taxpayer assessment histories. */
const SHORTCUT_SECTIONS: Record<string, string> = {
  "TIN-10000": "",
  "TIN-10001": "180",
  "TIN-10002": "180/180(2)",
  "TIN-10003": "180/182/183(7)",
};
export function getRegister4DemoShortcutSection(tin: string): string {
  return SHORTCUT_SECTIONS[tin.trim().toUpperCase()] ?? "";
}

// REGISTER-4 PROCEEDING GUARDRAILS v0.1 — REVIEW-ONLY.
// Source basis: NBR-SRC-001, Income Tax Act 2023 authentic English text
// (Gazette 16 Oct 2025), ss 180(2)-(3),182(1)-(13),183(7)-(8),
// 184, 212(1)-(6), 213, 285, 286, 289, 291, 292;
// Register-4 MoM 8 Oct 2026 pp 1-2.
// These are conservative candidate filters, NOT certified 2026/current-law
// or historical applicability. Every admitted transition remains review-required.
// Separate audit selection, notices, order identity, appeal/revision outcome,
// legal year/version, limitation and proof before ANY executable tax use.

export type Register4Decision =
  | { status:"BLOCKED"; reason:"INVALID_CODE"|"INCOMPATIBLE_SEQUENCE"|"INCOMPLETE_TRAIL"; next:string }
  | { status:"REVIEW_REQUIRED"; reason:"EVIDENCE_AND_APPLICABILITY"|"CUSTOM_UNVERIFIED"; next:string };

/** Partial UI candidate graph, deliberately excluding unknown legal transitions. */
const NEXT_BY_LAST: Record<string, readonly string[]> = {
  "": ["180","183(7)","184","212"],
  "180": ["180(2)","182","182(2)","183(7)","184","212"],
  "180(2)": ["182","182(2)","183(7)","212"],
  "182": ["182(2)","182(4)","182(11)","183(7)","184"],
  "182(2)": ["182(4)","182(11)","183(7)","184"],
  "182(4)": ["182(11)","183(7)","184"],
  "182(11)": ["212"],
  "183(7)": ["213","285","289","212"],
  "184": ["213","285","289","212"],
  "212": ["183(7)","184"],
  "213": ["183(7)","184","289","212"],
  "285": ["183(7)","184","212"],
  "289": ["292","183(7)","184","212"],
  "292": ["183(7)","184","212"],
};
const CATALOG_CODES: readonly string[] = [
  ...REGISTER4_SECTIONS.map(section => section.code),
  "182(2)", "182(4)", "182(11)"
];

/** Visible suggestions are candidate paths, not lawful approvals. */
export function nextRegister4CandidateCodes(trail:string): string[] {
  const previous=register4SectionTrail(trail);
  // Unknown historical/custom code cannot be mapped safely.
  return [...(NEXT_BY_LAST[previous[previous.length-1] ?? ""] ?? [])];
}
export function reviewRegister4Transition(trail:string, proposed:string):Register4Decision {
  const next=normalizeRegister4SectionCode(proposed);
  if(!isRegister4SectionSyntax(next))
    return {status:"BLOCKED", reason:"INVALID_CODE", next};
  const parts=register4SectionTrail(trail);
  if(parts.some(part=>!isRegister4SectionSyntax(part)))
    return {status:"BLOCKED",reason:"INCOMPLETE_TRAIL",next};
  if(CATALOG_CODES.includes(next) && !nextRegister4CandidateCodes(trail).includes(next))
    return {status:"BLOCKED",reason:"INCOMPATIBLE_SEQUENCE",next};
  // Other genuine provisions can be recorded only as unverified candidates.
  return {status:"REVIEW_REQUIRED",reason:CATALOG_CODES.includes(next)
    ? "EVIDENCE_AND_APPLICABILITY":"CUSTOM_UNVERIFIED",next};
}
export function reviewRegister4History(trail:string):Register4Decision {
  let accumulated="";
  let decision: Register4Decision={status:"BLOCKED",reason:"INCOMPLETE_TRAIL",next:""};
  for(const part of register4SectionTrail(trail)){
    decision=reviewRegister4Transition(accumulated,part);
    if(decision.status==="BLOCKED")return decision;
    accumulated=appendRegister4Section(accumulated,part) ?? accumulated;
  }
  return decision;
}
export function appendReviewedRegister4Section(trail:string,section:string):string|null {
  if(reviewRegister4Transition(trail,section).status==="BLOCKED")return null;
  return appendRegister4Section(trail,section);
}

// SOURCE-BOUNDED PRESET INVENTORY — Register-4 MoM 2026-10-08, p.2.
// Proposed office presets (subject to further detail), not universal lawful
// transitions. Keep every documented item visible; disable those without
// an admissible preceding recorded sequence in this review-only prototype.
export const REGISTER4_MOM_PRESETS = [
  { code:"182/183(7)", en:"Audit / assessment order", bn:"অডিট / কর নির্ধারণ আদেশ" },
  { code:"183(7)", en:"Assessment order", bn:"কর নির্ধারণ আদেশ" },
  { code:"184", en:"Best-judgment assessment", bn:"সর্বোত্তম বিবেচনায় কর নির্ধারণ" },
  { code:"289/183(7)", en:"Appeal / subsequent assessment", bn:"আপিল / পরবর্তী কর নির্ধারণ" },
  { code:"289/184", en:"Appeal / subsequent best-judgment assessment", bn:"আপিল / পরবর্তী সর্বোত্তম বিবেচনায় কর নির্ধারণ" },
  { code:"292", en:"Tribunal disposal", bn:"ট্রাইব্যুনাল নিষ্পত্তি" },
  { code:"292/183(7)", en:"Tribunal / subsequent assessment", bn:"ট্রাইব্যুনাল / পরবর্তী কর নির্ধারণ" },
  { code:"292/184", en:"Tribunal / subsequent best-judgment assessment", bn:"ট্রাইব্যুনাল / পরবর্তী সর্বোত্তম বিবেচনায় কর নির্ধারণ" },
  { code:"285", en:"Taxpayer revision", bn:"করদাতার আবেদনে পুনর্বিবেচনা" },
  { code:"213", en:"Revenue-protection revision", bn:"রাজস্বস্বার্থহানিকর আদেশ পুনর্বিবেচনা" },
] as const;

/**
 * Evaluate EVERY segment before appending a composite MoM preset. A multi-event
 * suffix is atomic: no earlier history is overwritten and a blocked second
 * step never leaves the first step half-applied.
 * REVIEW_REQUIRED is deliberately NOT a legal-validity / approval result.
 */
export function reviewRegister4Addition(trail:string, addition:string):Register4Decision {
  const normalized=normalizeRegister4SectionCode(addition);
  const additions=normalized.split("/");
  if(!normalized || additions.some(section=>!isRegister4SectionSyntax(section)))
    return {status:"BLOCKED",reason:"INVALID_CODE",next:normalized};
  if(trail && reviewRegister4History(trail).status==="BLOCKED")
    return {status:"BLOCKED",reason:"INCOMPLETE_TRAIL",next:normalized};

  let current=trail;
  let custom=false;
  for(const section of additions){
    const decision=reviewRegister4Transition(current,section);
    if(decision.status==="BLOCKED") return decision;
    custom=custom || decision.reason==="CUSTOM_UNVERIFIED";
    current=appendRegister4Section(current,section)!;
  }
  return {status:"REVIEW_REQUIRED",
    reason:custom?"CUSTOM_UNVERIFIED":"EVIDENCE_AND_APPLICABILITY",next:normalized};
}
export function appendReviewedRegister4Addition(trail:string, addition:string):string|null {
  if(reviewRegister4Addition(trail,addition).status==="BLOCKED") return null;
  const additions=normalizeRegister4SectionCode(addition).split("/");
  return [...register4SectionTrail(trail),...additions].join("/");
}
/** Exact MoM coverage, not an exhaustive enumeration of all statutory paths. */
export function getRegister4MoMPresetChoices(trail:string) {
  return REGISTER4_MOM_PRESETS.map(item=>({
    ...item,
    status:reviewRegister4Addition(trail,item.code).status
  }));
}
