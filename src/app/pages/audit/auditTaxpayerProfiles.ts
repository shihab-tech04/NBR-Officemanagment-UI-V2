import type { TableRow } from "../modulePageUtils";
import { AUDIT_SIGNAL_IDS, assessAuditPopulation, type ReturnInputs } from "./auditReturnScreening";

function base(n: number): ReturnInputs {
  const income=760000+(n%8)*32000, wealth=2400000+(n%6)*90000, prior=wealth-100000;
  return { income,taxPayable:72000,wealth,openingWealth:prior,priorWealth:prior,priorIncome:income-22000,
    funds:2300000,outflow:2300000,expenditure:420000,familyMembers:3,
    tds:24000,tdsRate:0.1,sourceIncome:300000,businessIncome:610000,
    payrollIncome:null,registryWealth:null,vatTurnover:null,amendmentDays:null,
    history:[{income:income-80000,tax:64000,wealth:wealth-220000,gap:0},
      {income:income-50000,tax:66000,wealth:wealth-160000,gap:0},
      {income:income-22000,tax:68000,wealth:prior,gap:0}] };
}
function pattern(p: ReturnInputs, code: string, gap=0): ReturnInputs {
  const x={...p,history:p.history.map(h=>({...h}))};
  switch(code) {
    case "R-A1":x.income=0;x.taxPayable=0;x.wealth=2400000;break;
    case "R-A2":x.taxPayable=0;break;
    case "R-A3":x.tds=120000;x.sourceIncome=500000;break;
    case "R-B1":x.priorWealth=1100000;x.openingWealth=1100000;x.wealth=3300000;break;
    case "R-B2":x.priorIncome=1600000;x.income=620000;x.priorWealth=1600000;x.openingWealth=1600000;x.wealth=2650000;break;
    case "R-C1":x.outflow=2300000+Math.max(275000,gap);break;
    case "R-C2":x.history=x.history.map((h,i)=>({...h,gap:[380000,340000,430000][i]}));break;
    case "R-C3":x.priorWealth=1250000;x.openingWealth=1750000;break;
    case "R-C4":x.expenditure=70000;break;
    case "R-D1":x.income=0;x.taxPayable=0;x.wealth=0;x.history=x.history.map(h=>({...h,income:0,tax:0}));break;
    case "R-D2":x.history=[
      {...x.history[0],income:1750000,wealth:1700000},
      {...x.history[1],income:300000,wealth:2450000},
      {...x.history[2],income:1800000,wealth:2400000}];break;
    case "R-D3":x.amendmentDays=9;break;
    case "R-E1":x.payrollIncome=x.income+900000;break;
    case "R-E2":x.registryWealth=x.wealth+950000;break;
    case "R-E3":x.vatTurnover=3500000;x.businessIncome=680000;break;
  }
  return x;
}
const names=["Padma Textiles","Sultana Holdings","Madhumati Agro","Arif Engineering","Rokeya Enterprise",
  "Bengal Garments","Meghna Agro Foods","Titas Pharmaceuticals","Barisal Logistics",
  "Narayanganj Industries","Jahanara Trading","Chattogram Marine","Shapla Food Products",
  "Feni Technology","Rangpur Motors","Mitali Stationery","Dhaleshwari Prints",
  "Mymensingh Foods","Shahjalal Services","Khulna Agro Supplies","Pabna Furniture",
  "Bogra Medical","Jashore Hardware","Dinajpur Trading","Sylhet Commerce",
  "Comilla Engineering","Noakhali Consulting","Rajshahi Industrial Parts"];
export function buildTaxpayerPopulation(existing:TableRow[]):TableRow[] {
  const old=existing.map((row,i)=>{
    let data=base(i+1);
    if(String(row.data_quality)==="Complete") {
      (String(row.signals??"").match(/R-[A-E][1-4]/g)??[]).forEach(code=>{
        data=pattern(data,code,code==="R-C1"?Number(row.mismatch_amount??0):0);
      });
    }
    return {...row,audit_input:data};
  });
  const newer=names.map((taxpayer_name,i)=>{
    const position=37+i,code=AUDIT_SIGNAL_IDS[i]??null;
    const coverage_tier=code?.startsWith("R-E")?"DT3":
      ["R-A2","R-A3"].includes(String(code))?"DT0":
      (code?.startsWith("R-B")||code?.startsWith("R-D")||["R-C2","R-C3"].includes(String(code)))?"DT1+H":"DT2";
    return {id:"P"+position,taxpayer_name,tin:"******"+(8100+position),
      return_id:"RET-2026-"+(20000+position),assessment_year:"2025-26",
      return_version:"v1",circle:"Circle-"+(1+i%4),coverage_tier,data_quality:"Complete",
      available_data:"Return + TDS + wealth / expenditure + linked returns",
      audit_state:"Not Started",control_flags:"—",
      audit_input:code?pattern(base(position),code):base(position)} as TableRow;
  });
  return assessAuditPopulation([...old,...newer]);
}
