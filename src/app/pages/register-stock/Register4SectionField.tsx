import { useRef, useState } from "react";
import { Popover } from "@mui/material";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextField } from "../../components/forms/AppTextField";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import {
  REGISTER4_SECTIONS, appendReviewedRegister4Section,
  nextRegister4CandidateCodes, normalizeRegister4SectionCode,
  reviewRegister4Transition
} from "./register4SectionCodes";

type Props = { id:string; label:string; value:string; onChange:(value:string)=>void;
  helper?:string; error?:string; required?:boolean };

/** Draft-only, fail-closed sequence picker. Actual legality is not assumed. */
export function Register4SectionField({id,label,value,onChange,helper,error,required}:Props) {
  const {t,i18n}=useTranslation("pages");
  const addAnchor=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const [custom,setCustom]=useState("");
  const [issue,setIssue]=useState("");
  const [draftCodes,setDraftCodes]=useState<string[]>([]);
  const bn=i18n.language?.startsWith("bn");
  const candidates=nextRegister4CandidateCodes(value);
  const known = [
    ...REGISTER4_SECTIONS,
    {code:"182(2)",en:"Audit teams appointed",bn:"অডিট দল নিয়োগ"},
    {code:"182(4)",en:"Audit inquiry stage",bn:"অডিট অনুসন্ধান কার্যক্রম"},
    {code:"182(11)",en:"Audit disposed after accepted revision",bn:"সংশোধিত রিটার্ন গ্রহণে অডিট নিষ্পত্তি"},
  ];
  const pick=(nextCode:string)=>{
    const decision=reviewRegister4Transition(value,nextCode);
    if(decision.status==="BLOCKED"){setIssue(t("register4.transitionBlocked"));return;}
    const next=appendReviewedRegister4Section(value,nextCode);
    if(next!==null){onChange(next);setIssue("");}
  };
  const close=()=>{setOpen(false);setCustom("");setIssue("");};
  const addCustom=()=>{
    const decision=reviewRegister4Transition(value,custom);
    if(decision.status==="BLOCKED"){
      setIssue(decision.reason==="INVALID_CODE"?t("register4.sectionInvalid"):t("register4.transitionBlocked"));
      return;
    }
    const code=normalizeRegister4SectionCode(custom);
    setDraftCodes(current=>current.includes(code)?current:[...current,code]);
    pick(code);
    close();
  };
  const options=[
    {value:"__current__",label:value || t("register4.sectionChoose")},
    ...candidates.map(code=>{
      const x=known.find(row=>row.code===code);
      return {value:"__pick__:"+code,label:code+" — "+(x?(bn?x.bn:x.en):t("register4.sectionCustomLabel"))};
    }),
    ...draftCodes.filter(code=>!candidates.includes(code))
      .map(code=>({value:"__pick__:"+code,label:code+" — "+t("register4.sectionCustomLabel")})),
  ];
  return (
    <div className="register4-section-field">
      <div className="register4-section-field__select">
        <AppSelectField id={id} label={label} value="__current__"
          onChange={option=>option.startsWith("__pick__:")&&pick(option.slice(9))}
          options={options} helper={error||helper} error={error} required={required}/>
      </div>
      <div className="register4-section-field__addition" ref={addAnchor}>
        <span className="register4-section-field__rule" aria-hidden="true" />
        <SecondaryButton icon={Plus} size="sm" className="register4-section-field__add"
          onClick={()=>{setOpen(true);setIssue("");}}>{t("register4.sectionAddNew")}</SecondaryButton>
      </div>
      {issue&&!open&&<p role="alert" className="register4-section-field__error">{issue}</p>}
      <Popover open={open} anchorEl={addAnchor.current}
        onClose={close}
        anchorOrigin={{vertical:"bottom",horizontal:"right"}}
        transformOrigin={{vertical:"top",horizontal:"right"}}
        slotProps={{paper:{className:"register4-section-field__popover"}}}>
        <div className="register4-section-field__popover-content">
          <h3 className="register4-section-field__popover-title">{t("register4.sectionAddNew")}</h3>
          <form onSubmit={event=>{event.preventDefault();event.stopPropagation();addCustom();}}>
            <AppTextField id={id+"-custom"} label={t("register4.sectionCustomLabel")}
              value={custom} onChange={value=>{setCustom(value);setIssue("");}}
              error={issue||undefined} placeholder="182(4)" maxLength={24} compact/>
            <div className="register4-section-field__actions">
              <SecondaryButton type="button" size="sm" onClick={close}>{t("register4.sectionCancel")}</SecondaryButton>
              <PrimaryButton type="submit" size="sm">{t("register4.sectionAdd")}</PrimaryButton>
            </div>
          </form>
        </div>
      </Popover>
    </div>
  );
}
