import {describe,expect,it} from "vitest";
import {buildPageKpis} from "../utils/buildPageKpis";
import {localizeRecordValue} from "../utils/recordDisplay";
import {formatLocalizedCurrency,formatLocalizedDate,formatLocalizedDateTime,formatLocalizedNumber,formatLocalizedPercent} from "../utils/localeFormatting";

type Messages = Record<string,unknown>;
const enFiles=import.meta.glob("../locales/en/*.json",{eager:true,import:"default"}) as Record<string,Messages>;
const bnFiles=import.meta.glob("../locales/bn/*.json",{eager:true,import:"default"}) as Record<string,Messages>;
function flatten(source:Messages,prefix=""):Record<string,string>{
  return Object.entries(source).reduce<Record<string,string>>((result,[key,value])=>{
    const path=prefix?`${prefix}.${key}`:key;
    if(typeof value==="string")result[path]=value;
    else if(value&&typeof value==="object"&&!Array.isArray(value))Object.assign(result,flatten(value as Messages,path));
    return result;
  },{});
}
const fields=(value:string)=>[...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(match=>match[1]).sort();

describe("English and Bengali translations",()=>{
  it("keeps every namespace and interpolation field in sync",()=>{
    expect(Object.keys(bnFiles).map(n=>n.split("/").pop()).sort()).toEqual(Object.keys(enFiles).map(n=>n.split("/").pop()).sort());
    for(const [path,enMessages] of Object.entries(enFiles)){
      const en=flatten(enMessages),bn=flatten(bnFiles[path.replace("/en/","/bn/")]);
      expect(Object.keys(bn).sort(),path).toEqual(Object.keys(en).sort());
      for(const key of Object.keys(en))expect(fields(bn[key]),`${path}:${key}`).toEqual(fields(en[key]));
    }
  });
  it("translates all human-facing Audit locale values",()=>{
    const en=flatten(enFiles["../locales/en/audit.json"]),bn=flatten(bnFiles["../locales/bn/audit.json"]);
    for(const [key,value] of Object.entries(en))if(!["columns.tin","initiate.funnel.helpers.percentage"].includes(key))expect(bn[key],key).not.toEqual(value);
  });
  it("localizes record values without changing identifiers",()=>{
    const bn=flatten(bnFiles["../locales/bn/tables.json"]),t=(key:string)=>bn[key]??key;
    expect(localizeRecordValue("Wrong AY",t,"bn")).toBe(bn["displayValues.wrongAy"]);
    expect(localizeRecordValue("Deputy Commissioner",t,"bn")).toBe(bn["displayValues.deputyCommissioner"]);
    expect(localizeRecordValue("123456789012",t,"bn")).toBe("123456789012");
    expect(localizeRecordValue("৳50000",t,"bn")).toMatch(/^৳[০-৯,]+$/);
    expect(localizeRecordValue("৳120,000",t,"bn")).toBe("৳১,২০,০০০");
    expect(localizeRecordValue("8%",t,"bn")).toBe("৮%");
    expect(localizeRecordValue("Very High",t,"bn")).toBe(bn["displayValues.veryHigh"]);
    expect(localizeRecordValue("Not determined",t,"bn")).toBe(bn["displayValues.notDetermined"]);
    expect(localizeRecordValue("OFFICER_SIGN_IN",t,"bn")).toBe(bn["displayValues.officerSignIn"]);
    expect(localizeRecordValue("Wrong assessment year selected",t,"bn")).toBe(bn["displayValues.wrongAssessmentYearSelected"]);
  });
  it("localizes generated KPI labels while preserving numeric counts",()=>{
    const cards=buildPageKpis([{status:"Pending"},{status:"Approved"}],{totalLabel:"Total Returns",statusField:"status",statuses:[{value:"Pending",label:"Pending",tone:"warning"}]});
    expect(cards.map(x=>x.labelKey)).toEqual(["totalReturns","pending"]);
    expect(cards.map(x=>x.value)).toEqual(["2","1"]);
  });
  it("formats Bengali numbers and dates",()=>{
    expect(formatLocalizedNumber(1234,"bn")).toContain("১");
    expect(formatLocalizedDate("2026-10-17","bn")).toMatch(/[০-৯]/);
    expect(formatLocalizedDate("invalid","bn")).toBe("invalid");
    expect(formatLocalizedCurrency(120000,"bn")).toBe("৳১,২০,০০০");
    expect(formatLocalizedPercent(36,"bn")).toBe("৩৬%");
    expect(formatLocalizedDateTime("2026-09-28T05:14:40Z","bn","UTC")).toContain("২০২৬");
  });
});
