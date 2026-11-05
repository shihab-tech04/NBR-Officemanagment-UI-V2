/** Executable Audit screening based on return, IT-10B, IT-10BB and linked-source values.
 * All configurable cut-offs here are workspace screening parameters, not tax rates
 * or a statutory assessment. A matched signal is a review lead, not a finding.
 */

export const AUDIT_SIGNAL_IDS = [
  'R-A1','R-A2','R-A3','R-B1','R-B2','R-C1','R-C2','R-C3','R-C4',
  'R-D1','R-D2','R-D3','R-E1','R-E2','R-E3',
] as const;
export type AuditSignalId = typeof AUDIT_SIGNAL_IDS[number];

export interface TaxReturnFacts {
  income: number; payableTax: number; tds: number; tdsApplicableRate: number;
  declaredTdsIncome: number; businessIncome: number;
  assets: number; priorAssets: number; openingWealth: number; priorClosingWealth: number;
  expenditure: number; priorExpenditure: number; otherReceipts: number; liabilitiesChange: number;
  priorIncome: number; incomeHistory: number[]; taxHistory: number[];
  assetHistory: number[]; gapHistory: number[];
  householdUnchanged: boolean; flagDate?: string; revisionDate?: string;
  payrollIncome?: number; registryAssets?: number; vatTurnover?: number;
}

/** Replaceable screening parameters, intentionally separate from any income-tax computation. */
export const AUDIT_THRESHOLDS = Object.freeze({
  tdsIncomeGap: 100_000,
  assetGrowthAmount: 1_000_000, assetGrowthRatio: 0.5,
  incomeDeclineRatio: 0.25, fundsGap: 200_000,
  cumulativeGap: 400_000, openingWealthGap: 100_000,
  householdExpenditureFloor: 80_000, householdExpenditureDropRatio: 0.6,
  externalIncomeGap: 150_000, externalAssetGap: 200_000,
  vatIndicativeMargin: 0.15, vatIncomeGap: 200_000, amendmentDays: 30,
});

const finite = (value: number) => Number.isFinite(value) && value >= 0;
const fundsClosing = (f: TaxReturnFacts) => f.openingWealth + f.income + f.otherReceipts - f.expenditure - f.liabilitiesChange;
const abs = Math.abs;
const dayDifference = (later?: string, earlier?: string) => {
  if (!later || !earlier) return Number.POSITIVE_INFINITY;
  const a = Date.parse(later), b = Date.parse(earlier);
  return Number.isFinite(a) && Number.isFinite(b) ? (a - b) / 86_400_000 : Number.POSITIVE_INFINITY;
};

export function evaluateAuditSignals(f: TaxReturnFacts): AuditSignalId[] {
  const numeric = [f.income,f.payableTax,f.tds,f.tdsApplicableRate,f.declaredTdsIncome,
    f.businessIncome,f.assets,f.priorAssets,f.openingWealth,f.priorClosingWealth,
    f.expenditure,f.priorExpenditure,f.otherReceipts,f.liabilitiesChange,f.priorIncome];
  if (numeric.some(v => !finite(v)) || f.tdsApplicableRate > 1) return [];
  const x = AUDIT_THRESHOLDS;
  const hits = new Set<AuditSignalId>();
  const add = (condition: boolean, id: AuditSignalId) => { if (condition) hits.add(id); };
  add(f.income === 0 && f.payableTax === 0 && f.assets > 0, 'R-A1');
  add(f.income > 0 && f.payableTax === 0, 'R-A2');
  add(f.tdsApplicableRate > 0 && f.tds > 0 && f.tds / f.tdsApplicableRate - f.declaredTdsIncome >= x.tdsIncomeGap, 'R-A3');
  const growth = f.assets - f.priorAssets;
  add(f.priorAssets > 0 && growth > 0 &&
    (growth >= x.assetGrowthAmount || growth / f.priorAssets >= x.assetGrowthRatio), 'R-B1');
  add(f.priorIncome > 0 && (f.priorIncome - f.income) / f.priorIncome >= x.incomeDeclineRatio && growth > 100_000, 'R-B2');
  const gap = f.assets - fundsClosing(f);
  add(abs(gap) >= x.fundsGap, 'R-C1');
  const history = f.gapHistory.filter(Number.isFinite);
  add(history.length >= 3 &&
    (abs(history.reduce((a,b)=>a+b,0)) >= x.cumulativeGap ||
     history.filter(v=>v >= 100_000).length >= 2 ||
     history.filter(v=>v <= -100_000).length >= 2), 'R-C2');
  add(abs(f.openingWealth - f.priorClosingWealth) >= x.openingWealthGap, 'R-C3');
  add(f.expenditure < x.householdExpenditureFloor ||
    (f.householdUnchanged && f.priorExpenditure > 0 &&
    f.expenditure / f.priorExpenditure < 1 - x.householdExpenditureDropRatio), 'R-C4');
  add(f.incomeHistory.length >= 3 && f.taxHistory.length >= 3 &&
    (f.incomeHistory.slice(-3).every(v=>v === 0) ||
      f.taxHistory.slice(-3).every(v=>v === 0)), 'R-D1');
  const h = f.incomeHistory.slice(-3);
  add(h.length === 3 && h[0] >= 500_000 && h[1] < h[0] * 0.5 &&
    h[2] >= h[0] * 0.75 && f.assetHistory.length >= 3, 'R-D2');
  const days = dayDifference(f.revisionDate, f.flagDate);
  add(days >= 0 && days <= x.amendmentDays, 'R-D3');
  add(f.payrollIncome !== undefined && f.payrollIncome - f.income >= x.externalIncomeGap, 'R-E1');
  add(f.registryAssets !== undefined && f.registryAssets - f.assets >= x.externalAssetGap, 'R-E2');
  add(f.vatTurnover !== undefined && f.vatTurnover * x.vatIndicativeMargin - f.businessIncome >= x.vatIncomeGap, 'R-E3');
  return AUDIT_SIGNAL_IDS.filter(id=>hits.has(id));
}

export function auditRiskLevel(ids: AuditSignalId[], facts: TaxReturnFacts): string {
  if (!ids.length) return 'Not determined';
  const strong = ids.filter(id=>id.startsWith('R-E') || id==='R-C2' ||
    (id==='R-C1' && Math.abs(facts.assets - fundsClosing(facts)) >= 3 * AUDIT_THRESHOLDS.fundsGap));
  const families = new Set(strong.map(id => id.startsWith('R-E') ? id : 'funds'));
  if (strong.length >= 2 && families.size >= 2) return 'Very High';
  if (strong.length || ids.length >= 3) return 'High';
  if (ids.length >= 2 || ids.some(id=>!['R-A1','R-A2','R-D3'].includes(id))) return 'Medium';
  return 'Low';
}

/** Build a complete, arithmetically internally consistent financial record.
 * The scenario specifies INPUT characteristics; matching signals are always computed.
 */
export function makeAuditProfile(scenarios: readonly string[], sequence: number, gapAmount?: number): TaxReturnFacts {
  const f: TaxReturnFacts = {
    income: 800_000, payableTax: 50_000, tds: 40_000,
    tdsApplicableRate: 0.1, declaredTdsIncome: 400_000, businessIncome: 400_000,
    assets: 2_000_000, priorAssets: 1_950_000, openingWealth: 1_500_000,
    priorClosingWealth: 1_500_000, expenditure: 300_000, priorExpenditure: 300_000,
    otherReceipts: 0, liabilitiesChange: 0, priorIncome: 750_000,
    incomeHistory: [700_000,750_000,800_000], taxHistory: [45_000,47_000,50_000],
    assetHistory: [1_900_000,1_950_000,2_000_000], gapHistory: [0,0,0],
    householdUnchanged: true,
  };
  // Small, deterministic differences keep records individual without crossing thresholds.
  f.income += (sequence % 7) * 2_000;
  f.openingWealth -= (sequence % 7) * 2_000;
  f.incomeHistory[2] = f.income;
  for (const id of scenarios) {
    switch (id) {
      case 'R-A1': f.income=0; f.payableTax=0; break;
      case 'R-A2': f.payableTax=0; break;
      case 'R-A3': f.tds=100_000; f.declaredTdsIncome=350_000; break;
      case 'R-B1': f.assets+=1_200_000; break;
      case 'R-B2': f.priorIncome=1_300_000; f.assets+=300_000; break;
      case 'R-C1': f.assets+=800_000; break;
      case 'R-C2': f.gapHistory=[200_000,250_000,300_000]; break;
      case 'R-C3': f.priorClosingWealth-=400_000; break;
      case 'R-C4': f.expenditure=50_000; break;
      case 'R-D1': f.income=0; f.payableTax=0; f.assets=0; f.priorAssets=0; f.incomeHistory=[0,0,0]; f.taxHistory=[0,0,0]; break;
      case 'R-D2': f.income=900_000; f.incomeHistory=[850_000,200_000,900_000]; f.assetHistory=[1_800_000,1_950_000,2_000_000]; break;
      case 'R-D3': f.flagDate='2026-09-01'; f.revisionDate='2026-09-15'; break;
      case 'R-E1': f.payrollIncome=1_500_000; break;
      case 'R-E2': f.registryAssets=3_500_000; break;
      case 'R-E3': f.vatTurnover=10_000_000; break;
    }
  }
  // Keep the funds-flow identity balanced unless a funds-gap case is intended.
  const intentionalGap = scenarios.includes('R-C1') ? (gapAmount ?? 800_000) : 0;
  f.openingWealth = f.assets - f.income - f.otherReceipts + f.expenditure + f.liabilitiesChange - intentionalGap;
  if (!scenarios.includes('R-C3')) f.priorClosingWealth = f.openingWealth;
  else f.priorClosingWealth=f.openingWealth - 400_000;
  f.incomeHistory[2]=scenarios.includes('R-D2') ? 900_000 : f.income;
  f.taxHistory[2] = f.payableTax;
  if (f.income === 0) { f.tds = 0; f.declaredTdsIncome = 0; f.businessIncome = 0; }
  return f;
}

export function screenTaxpayer<T extends Record<string, unknown>>(row: T, financial: TaxReturnFacts) {
  if (String(row.data_quality) !== 'Complete') return { ...row, financial_inputs: JSON.stringify(financial), signals: '—', risk_level: 'Not determined', mismatch_amount: 0 };
  const hits = evaluateAuditSignals(financial);
  const amount = Math.max(0, Math.abs(financial.assets - fundsClosing(financial)));
  return {
    ...row, financial_inputs: JSON.stringify(financial),
    declared_income: financial.income, tax_payable: financial.payableTax,
    declared_assets: financial.assets, household_expenditure: financial.expenditure,
    signals: hits.length ? hits.join(' + ') : '—',
    risk_level: auditRiskLevel(hits, financial),
    mismatch_amount: amount,
    signal_evidence: hits.join(', '),
  };
}

// These records augment the existing 36 taxpayer profiles. The financial
// characteristics, not a list of expected matches, drive their screening results.
const PROFILE_NAMES = [
  'Anika Engineering', 'Rupsha Textiles', 'Shapla Construction', 'Titas Imports',
  'Mitali Healthcare', 'Bengal Agro Trading', 'Aranya Ceramics', 'Surma Logistics',
  'Rangpur Foods', 'Bayline Electronics', 'Barisal Fisheries', 'Meghna Steel Works',
  'Karnaphuli Paper', 'Sundarban Knitwear', 'Padma Pharmaceuticals',
  'Nabanna Services', 'Dhaka Precision', 'Khulna Packaging', 'Shonar Bangla Motors',
  'Eastern Green Energy', 'Dhanmondi Retail', 'Rajshahi Plastics',
  'Brahmaputra Cold Storage', 'Comilla Digital',
  'Purbasha Distribution', 'Chittagong Trading', 'Narayanganj Tiles',
  'Uttara Furnishings', 'Jessore Agro Foods', 'Gazipur Apparel',
  'Bogura Hardware', 'Sylhet Garden Supply', 'Faridpur Transport', 'Cumilla Media',
] as const;

const PROFILE_CHARACTERISTICS: readonly (readonly AuditSignalId[])[] = [
  ['R-A1'], ['R-A2'], ['R-A3'], ['R-B1'], ['R-B2'],
  ['R-C1'], ['R-C2'], ['R-C3'], ['R-C4'], ['R-D1'],
  ['R-D2'], ['R-D3'], ['R-E1'], ['R-E2'], ['R-E3'],
  ['R-C1','R-E1'], ['R-C1','R-E2'], ['R-B1','R-C1'],
  ['R-B2','R-E3'], ['R-A3','R-E1'], ['R-D3','R-E3'],
  ['R-C2','R-E2'], ['R-C4','R-A2'], ['R-C3','R-D2'],
  [],[],[],[],[],[],[],[],[],[],
];

export function buildAuditTaxpayerPopulation<T extends Record<string, unknown>>(baseline: T[]) {
  const previous = baseline.map((row, index) => {
    // Existing expected scenarios determine which financial facts are prepared;
    // the original prefilled signal labels never enter the screening algorithm.
    const profile: string[] = [...(String(row.signals ?? '').match(/R-[A-E]\d/g) ?? [])];
    return screenTaxpayer(row, makeAuditProfile(profile, index + 1, profile.includes('R-C1') ? Number(row.mismatch_amount) : undefined));
  });
  const additions = PROFILE_NAMES.map((taxpayer_name, index) => {
    const serial = index + 1;
    const row = {
      id: 'P' + (baseline.length + serial),
      taxpayer_name,
      tin: '******' + String(8000 + serial).padStart(4, '0'),
      return_id: 'RET-2026-' + (20000 + serial),
      assessment_year: '2025-26',
      return_version: 'v1',
      circle: 'Circle-' + ((index % 4) + 1),
      data_quality: 'Complete',
      coverage_tier: 'DT3',
      available_data: 'Return, IT-10B, IT-10BB, linked history and relevant source records',
      control_flags: '—',
      audit_state: 'Not Started',
      reason_code: 'Return values and linked records screened against the selected rules',
    };
    return screenTaxpayer(row, makeAuditProfile(PROFILE_CHARACTERISTICS[index], 37 + index));
  });
  return [...previous, ...additions];
}