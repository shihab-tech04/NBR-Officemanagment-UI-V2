import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Info, X } from "lucide-react";
import { Popper } from "@mui/material";
import { useTranslation } from "react-i18next";
import { AppTextField } from "../../components/forms/AppTextField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppDateField } from "../../components/forms/AppDateField";
import { AppNumberField } from "../../components/forms/AppNumberField";
import { Register4SectionField } from "./Register4SectionField";
import { findRegister4Taxpayer, getRegister4TinSuggestions } from "./Register4EntryModal";
import { getRegister4DemoShortcutSection, reviewRegister4History } from "./register4SectionCodes";
import "../../../styles/register4-entry.css";

interface Props {
  mode:"table"|"mobile"; assessmentYear:string; values:Record<string,string>;
  onChange:(patch:Record<string,string>)=>void; onSave:()=>void; onCancel:()=>void;
}
/** Synchronous safety checks; same controlled demo identity and section history as New Entry. */
export function validateRegister4InlineRow(v:Record<string,string>,year:string):
  "TIN"|"SECTION"|"YEAR"|null {
  const taxpayer=findRegister4Taxpayer(v.tin || "");
  if(!taxpayer || v.taxpayer_name!==taxpayer.taxpayer_name ||
     v.circle!==taxpayer.circle) return "TIN";
  if(!v.assessment_year || v.assessment_year!==year) return "YEAR";
  if(reviewRegister4History(v.disposal_code || "").status==="BLOCKED") return "SECTION";
  return null;
}
export function Register4InlineRow({mode,assessmentYear,values,onChange,onSave,onCancel}:Props) {
  const {t}=useTranslation("pages");
  const {t:th}=useTranslation("tables");
  const [error,setError]=useState<"TIN"|"SECTION"|"YEAR"|null>(null);
  const tinAnchor=useRef<HTMLDivElement>(null);
  const [tinOpen,setTinOpen]=useState(false);
  const set=(key:string,value:string)=>{onChange({[key]:value});setError(null);};
  const updateTin=(tin:string)=>{
    const taxpayer=findRegister4Taxpayer(tin);
    // Suggestions are a floating lookup, never an in-flow table subrow.
    if(taxpayer)setTinOpen(false);
    onChange({
      tin,
      taxpayer_name:taxpayer?.taxpayer_name ?? "",
      circle:taxpayer?.circle ?? "",
      assessment_year:taxpayer ? assessmentYear : "",
      disposal_code:taxpayer ? getRegister4DemoShortcutSection(taxpayer.tin) : "",
    });
    setError(null);
  };
  const save=()=>{
    const issue=validateRegister4InlineRow(values,assessmentYear);
    if(issue){setError(issue);return;}
    onSave();
  };
  const keyDown=(e:KeyboardEvent)=>{
    if(e.defaultPrevented || (e.target as HTMLElement).closest(".register4-section-field"))return;
    if(e.key==="Escape"){
      e.preventDefault();onCancel();return;
    }
    // Enter from TIN, amount, date or any intermediate field must NOT save
    // an incomplete row. Only the final Remarks field retains the eLedger
    // convenience shortcut; the explicit tick remains the primary Save.
    if(e.key==="Enter" && e.target instanceof HTMLInputElement &&
      (e.target as HTMLInputElement).id==="register4-inline-"+mode+"-remarks"){
      e.preventDefault();save();
    }
  };
  const field=(key:string,label:string,type:"text"|"date"|"number"|"select",extraClass="")=>{
    const id="register4-inline-"+mode+"-"+key;
    const value=values[key] ?? "";
    let el:ReactNode;
    if(type==="date")el=<AppDateField compact id={id} label={label} value={value} onChange={v=>set(key,v)}/>;
    else if(type==="number")el=<AppNumberField compact id={id} label={label} value={value} onChange={v=>set(key,v)}/>;
    else if(type==="select")el=<AppSelectField compact id={id} label={label} value={value}
      onChange={v=>set(key,v)} required error={error==="YEAR"?t("register4.yearRequired"):undefined}
      options={[{value:"",label:"—"},{value:assessmentYear,label:assessmentYear}]}/>;
    else el=<AppTextField compact id={id} label={label} value={value} onChange={v=>set(key,v)}
      placeholder={mode==="table" ? label : undefined}/>;
    return <div className={"register4-inline__cell "+extraClass}>{el}</div>;
  };
  // Reuse exactly the modal's controlled fixture matching and shortcut labels.
  // Suggestions assist selection only; they are not a live NBR TIN lookup.
  const suggestions=findRegister4Taxpayer(values.tin??"")
    ? [] : getRegister4TinSuggestions(values.tin??"");
  const tinControl=<div className="register4-inline__cell register4-inline__cell--identity">
    <div ref={tinAnchor} className="register4-inline__tin-anchor"
      onFocus={()=>{if(!findRegister4Taxpayer(values.tin??""))setTinOpen(true);}}
      onBlur={event=>{
        const destination=event.relatedTarget as HTMLElement|null;
        if(!destination?.closest(".register4-inline__tin-popup"))setTinOpen(false);
      }}>
      <AppTextField compact id={"register4-inline-"+mode+"-tin"} label={t("register4.tinInput")}
        placeholder={mode==="table" ? t("register4.tinInput") : undefined}
        value={values.tin??""} onChange={updateTin} required
        error={error==="TIN"?t("register4.tinRequired"):undefined}/>
    </div>
    <Popper
      open={tinOpen && suggestions.length>0}
      anchorEl={tinAnchor.current}
      placement="bottom-start"
      className="register4-inline__tin-popup"
      modifiers={[{name:"offset",options:{offset:[0,4]}},
        {name:"preventOverflow",options:{padding:8}}]}>
      <div className="register4-inline__tin-suggestions" role="group"
        aria-label={t("register4.tinSuggestions")}>
        {suggestions.map(tin=>(
          <button key={tin} type="button" className="register4-inline__tin-option"
            aria-label={tin} onClick={()=>updateTin(tin)}
            title={getRegister4DemoShortcutSection(tin)
              ? t("register4.shortcutExample",{sections:getRegister4DemoShortcutSection(tin)})
              : t("register4.shortcutFresh")}>
            <span className="register4-inline__tin-option-name">{tin}</span>
            <span className="register4-inline__tin-option-history">
              {getRegister4DemoShortcutSection(tin)||t("register4.shortcutFresh")}
              <Info size={12} aria-hidden="true"/>
            </span>
          </button>
        ))}
      </div>
    </Popper>
    {values.taxpayer_name && <p className="register4-inline__readonly register4-inline__taxpayer" aria-live="polite">
      {values.taxpayer_name}
    </p>}
    {!values.taxpayer_name && (values.tin||"").length>=8 &&
      <p className="register4-inline__readonly register4-inline__taxpayer" role="status">
        {t("register4.inlineNotFound")}
      </p>}
  </div>;
  const sectionControl=<div className="register4-inline__cell register4-inline__cell--section">
    <Register4SectionField id={"register4-inline-"+mode+"-disposal_code"}
      label={th("headers.register4DisposalCode")} value={values.disposal_code??""}
      onChange={v=>set("disposal_code",v)} required
      error={error==="SECTION"?t("register4.sectionRequired"):undefined}/>

  </div>;
  const controls:ReactNode[]=[
    <div className="register4-inline__cell register4-inline__cell--serial"><AppTextField compact id={"register4-inline-"+mode+"-serial_no"}
      label={th("headers.register4SerialNo")} value={values.serial_no??""}
      placeholder={mode==="table"?th("headers.register4SerialNo"):undefined} readOnly onChange={()=>{}}/></div>,
    <div className="register4-inline__cell"><AppTextField compact id={"register4-inline-"+mode+"-circle"}
      label={th("headers.circle")} value={values.circle??""}
      placeholder={mode==="table"?th("headers.circle"):undefined} readOnly onChange={()=>{}}/></div>,
    tinControl,
    <div className="register4-inline__cell"><AppTextField compact id={"register4-inline-"+mode+"-folio_no"}
      label={th("headers.register4FolioNo")} value=""
      placeholder={mode==="table"?th("headers.register4FolioNo"):undefined} readOnly onChange={()=>{}}/></div>,
    sectionControl,
    field("assessment_year",th("headers.register4AssessmentYear"),"select"),
    field("assessment_date",th("headers.register4AssessmentDate"),"date","register4-inline__cell--date"),
    field("assessed_income",th("headers.register4AssessedIncome"),"number","register4-inline__cell--money"),
    field("arrear_year_demand",th("headers.register4ArrearYearDemand"),"number","register4-inline__cell--money"),
    field("current_year_demand",th("headers.register4CurrentYearDemand"),"number","register4-inline__cell--money"),
    field("penalty",th("headers.register4Penalty"),"number","register4-inline__cell--money"),
    field("revised_demand",th("headers.register4RevisedDemand"),"number","register4-inline__cell--money"),
    field("remarks",th("headers.register4Remarks"),"text","register4-inline__cell--remarks"),
  ];
  const actions=<div className="register4-inline__actions">
    <button type="button" className="register4-inline__icon"
      aria-label={t("register4.saveRow")} title={t("register4.saveRow")} onClick={save}>
      <Check size={17} aria-hidden="true"/>
    </button>
    <button type="button" className="register4-inline__icon register4-inline__icon--cancel"
      aria-label={t("register4.discardRow")} title={t("register4.discardRow")} onClick={onCancel}>
      <X size={17} aria-hidden="true"/>
    </button>
  </div>;
  if(mode==="mobile")return <section className="register4-inline__mobile" aria-label={t("register4.inlineDraft")} onKeyDown={keyDown}>
    <h3 className="register4-inline__mobile-title">{t("register4.inlineDraft")}</h3>
    <div className="register4-inline__mobile-grid">
      {controls.map((item,index)=><div key={index} className={[2,4,12].includes(index)?"register4-inline__mobile-span":undefined}>{item}</div>)}
    </div>
    <div className="register4-inline__mobile-footer">{actions}</div>
  </section>;
  return <tr className="register4-inline__row" data-testid="register4-inline-row" onKeyDown={keyDown}>
    {controls.map((item,index)=><td key={index} className="card-table__td">{item}</td>)}
    <td className="card-table__td">{actions}</td>
  </tr>;
}
