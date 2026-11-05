import type { TableRow } from "../modulePageUtils";

export type ReturnInputs = {
  income: number; taxPayable: number; wealth: number; openingWealth: number;
  priorWealth: number | null; priorIncome: number | null;
  funds: number | null; outflow: number | null; expenditure: number | null;
  familyMembers: number; tds: number | null; tdsRate: number | null;
  sourceIncome: number | null; businessIncome: number | null;
  payrollIncome: number | null; registryWealth: number | null;
  vatTurnover: number | null; amendmentDays: number | null;
  history: { income: number; tax: number; wealth: number; gap: number }[];
};

export const AUDIT_SIGNAL_IDS = ["R-A1","R-A2","R-A3","R-B1","R-B2",
  "R-C1","R-C2","R-C3","R-C4","R-D1","R-D2","R-D3","R-E1","R-E2","R-E3"] as const;
type Level = "weak" | "meaningful" | "strong";
type Hit = { id: string; level: Level; family: string; fact: string; measured: number; threshold: number };
const positive = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
export function evaluateAuditReturn(data: ReturnInputs, coverage: string, quality: string) {
  const hits: Hit[] = [];
  const add = (id: string, level: Level, family: string, fact: string, measured: number, threshold: number) =>
    hits.push({ id, level, family, fact, measured, threshold });
  if (quality !== "Complete" || !positive(data.income) || !positive(data.taxPayable)) {
    return { hits, riskLevel: "Not determined", gap: 0 };
  }
  const asset = coverage !== "DT0" && positive(data.wealth);
  const hist = data.history.length > 0;
  const ext = coverage === "DT3";
  const gap = positive(data.funds) && positive(data.outflow) ? data.outflow - data.funds : 0;
  const material = Math.max(200000, (data.funds ?? 0) * 0.1);
  if (asset && data.income === 0 && data.taxPayable === 0 && data.wealth > 0)
    add("R-A1", data.wealth > 4000000 ? "strong" : "weak", "asset", "zero-wealth", data.wealth, 0);
  if (data.income > 0 && data.taxPayable === 0)
    add("R-A2", data.income >= 1000000 ? "meaningful" : "weak", "tax", "zero-tax", data.income, 0);
  if (positive(data.tds) && positive(data.tdsRate) && data.tdsRate > 0 && positive(data.sourceIncome)) {
    const implied = data.tds / data.tdsRate;
    if (implied - data.sourceIncome > 200000)
      add("R-A3", "meaningful", "tax", "tds-floor", implied - data.sourceIncome, 200000);
  }
  if (asset && hist && positive(data.priorWealth) && data.priorWealth > 0) {
    const growth = data.wealth - data.priorWealth;
    if (growth >= 500000 && growth / data.priorWealth >= 0.25)
      add("R-B1", "meaningful", "asset", "asset-growth", growth, 500000);
    if (positive(data.priorIncome) && data.priorIncome > 0 &&
      (data.priorIncome - data.income) / data.priorIncome >= 0.25 && growth > 250000)
      add("R-B2", "meaningful", "asset", "asset-growth", growth, 250000);
  }
  if (asset && positive(data.funds) && positive(data.outflow) && Math.abs(gap) > material)
    add("R-C1", Math.abs(gap) > material * 3 ? "strong" : "meaningful",
      "funds", "funds-gap", Math.abs(gap), material);
  if (asset && data.history.length >= 2) {
    const gaps = data.history.slice(-3).map(x=>x.gap);
    const sameDirection = gaps.every(g=>g>0) || gaps.every(g=>g<0);
    const total = gaps.reduce((sum,n)=>sum+n,0);
    if (sameDirection && Math.abs(total)>500000)
      add("R-C2","strong","funds","funds-gap-multi",Math.abs(total),500000);
  }
  if (asset && hist && positive(data.priorWealth) && Math.abs(data.openingWealth - data.priorWealth)>200000)
    add("R-C3","meaningful","funds","wealth-continuity",Math.abs(data.openingWealth-data.priorWealth),200000);
  if (asset && positive(data.expenditure) && data.familyMembers>=2 && data.expenditure<150000)
    add("R-C4","meaningful","expense","household-expense",150000-data.expenditure,150000);
  if (data.history.length>=3 &&
    [...data.history.slice(-3).map(y=>({income:y.income,tax:y.tax})),
     {income:data.income,tax:data.taxPayable}]
     .every(y=>y.income===0 || (y.income>0&&y.tax===0)))
    add("R-D1","meaningful","history","persistent-low-tax",4,3);
  if (data.history.length>=3) {
    const h=data.history.slice(-3);
    if (h[0].income>0 && h[2].income>0 &&
      h[1].income<h[0].income*0.55 && h[1].income<h[2].income*0.55 &&
      h[1].wealth>h[0].wealth*1.2)
      add("R-D2","meaningful","history","alternating-return",h[1].wealth-h[0].wealth,h[0].wealth*0.2);
  }
  if (hist && positive(data.amendmentDays) && data.amendmentDays<=30)
    add("R-D3","meaningful","history","amendment-timing",data.amendmentDays,30);
  if (ext && positive(data.payrollIncome) && data.payrollIncome-data.income>200000)
    add("R-E1","strong","payroll","external-payroll",data.payrollIncome-data.income,200000);
  if (ext && asset && positive(data.registryWealth) && data.registryWealth-data.wealth>200000)
    add("R-E2","strong","registry","external-registry",data.registryWealth-data.wealth,200000);
  if (ext && positive(data.vatTurnover) && positive(data.businessIncome) &&
    data.vatTurnover>data.businessIncome*1.5+200000)
    add("R-E3","strong","vat","external-vat",data.vatTurnover-data.businessIncome,200000);
  const weight: Record<Level,number>={weak:1,meaningful:2,strong:3};
  const facts=new Map<string,Hit>();
  hits.forEach(h=>{const old=facts.get(h.fact);if(!old||weight[old.level]<weight[h.level])facts.set(h.fact,h)});
  const counted=[...facts.values()];
  const corroborated=counted.some(a=>a.level==="strong"&&
    counted.some(b=>a!==b&&a.family!==b.family&&weight[b.level]>=2));
  const meaningful=counted.filter(h=>h.level==="meaningful");
  const independentMeaningful=meaningful.some(a=>meaningful.some(b=>a!==b&&a.family!==b.family));
  const riskLevel=corroborated?"Very High":counted.some(h=>h.level==="strong")||independentMeaningful?"High":
    meaningful.length?"Medium":"Low";
  return {hits,riskLevel,gap};
}

export function assessAuditPopulation(rows: TableRow[]): TableRow[] {
  return rows.map(row=>{
    const input=row.audit_input as ReturnInputs | undefined;
    if(!input) return row;
    const {hits,riskLevel,gap}=evaluateAuditReturn(input,String(row.coverage_tier),String(row.data_quality));
    return {...row,signals:hits.length?hits.map(h=>h.id).join(" + "):"—",
      risk_level:riskLevel, mismatch_amount:hits.some(h=>h.id==="R-C1")?Math.abs(gap):0,
      signal_details:hits,
      reason_code:Number(String(row.id).replace(/^P/,""))<=36?String(row.reason_code??""):
        hits.length?hits.map(h=>h.id+": "+h.measured.toLocaleString("en-BD")+" / "+h.threshold.toLocaleString("en-BD")).join("; "):
        String(row.reason_code??"No audit signals matched")};
  });
}
