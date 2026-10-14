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

export function undoRegister4Section(trail: string): string {
  return register4SectionTrail(trail).slice(0, -1).join("/");
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
