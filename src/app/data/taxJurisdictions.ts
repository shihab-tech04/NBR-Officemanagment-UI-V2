export interface VerifiedTaxJurisdiction {
  zone: string;
  circles: readonly string[];
  sourceLabel: string;
  sourceUrl: string;
  verifiedOn: string;
}

/**
 * Only include Zone → Circle mappings that have been verified from an
 * authoritative NBR/field-office source. Do not generate fallback circles.
 */
export const VERIFIED_TAX_JURISDICTIONS: Record<string, VerifiedTaxJurisdiction> = {
  "Taxes Zone, Barishal": {
    zone: "Taxes Zone, Barishal",
    circles: [
      "Circle-01 (Companies), Barishal",
      "Circle-02 (Companies), Barishal",
      "Circle-03, Barishal",
      "Circle-04, Barishal",
      "Circle-05, Jalakhati",
      "Circle-06, Barishal",
      "Circle-07(Salaries), Barishal",
      "Circle-08, Barishal",
      "Circle-09, Barishal",
      "Circle-10, Bhola",
      "Circle-11, Bhola",
      "Circle-12, Nalchiti, Jalakhati",
      "Circle-13 (Salaries), Barishal",
      "Circle-14, Barishal",
      "Circle-15, Borguna",
      "Circle-16, Lalmohan, Bhola",
      "Circle-17, Sworupkhati, Perojpur",
      "Circle-18, (Salaries), Patuakhali",
      "Circle-19, Galachipa, Patuakhali",
      "Circle-20, Khapupara, Patuakhali",
      "Circle-21, Patuakhali",
      "Circle-22, Barishal",
    ],
    sourceLabel: "Taxes Zone, Barishal — official office directory",
    sourceUrl: "https://tax.barisal.gov.bd/",
    verifiedOn: "2026-10-05",
  },
};

export function getVerifiedCirclesForZone(zone: string): string[] {
  return [...(VERIFIED_TAX_JURISDICTIONS[zone]?.circles ?? [])];
}

export function hasVerifiedCircleMapping(zone: string): boolean {
  return Boolean(VERIFIED_TAX_JURISDICTIONS[zone]?.circles.length);
}
