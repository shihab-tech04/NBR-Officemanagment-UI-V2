import { useRef, useState } from "react";
import { Popover } from "@mui/material";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextField } from "../../components/forms/AppTextField";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import {
  REGISTER4_SECTIONS,
  nextRegister4CandidateCodes, normalizeRegister4SectionCode, isRegister4SectionSyntax,
  reviewRegister4Addition, appendReviewedRegister4Addition,
  getRegister4MoMPresetChoices, REGISTER4_MOM_PRESETS
} from "./register4SectionCodes";

type Props = { id:string; label:string; value:string; onChange:(value:string)=>void;
  helper?:string; error?:string; required?:boolean;
  compact?:boolean; editor?:"popover"|"inline" };

/** Draft-only, fail-closed sequence picker. Actual legality is not assumed. */
export function Register4SectionField({id,label,value,onChange,helper,error,required,
  compact=false,editor="popover"}:Props) {
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
  const pick=(suffix:string)=>{
    const decision=reviewRegister4Addition(value,suffix);
    if(decision.status==="BLOCKED"){setIssue(t("register4.transitionBlocked"));return;}
    const next=appendReviewedRegister4Addition(value,suffix);
    if(next!==null){onChange(next);setIssue("");}
  };
  const close=()=>{setOpen(false);setCustom("");setIssue("");};
  const addCustom=()=>{
    // Custom Add accepts ONE section number; multi-section paths come from the MoM presets.
    if(!isRegister4SectionSyntax(custom)){setIssue(t("register4.sectionInvalid"));return;}
    const decision=reviewRegister4Addition(value,custom);
    if(decision.status==="BLOCKED"){
      setIssue(decision.reason==="INVALID_CODE"?t("register4.sectionInvalid"):t("register4.transitionBlocked"));
      return;
    }
    const code=normalizeRegister4SectionCode(custom);
    setDraftCodes(current=>current.includes(code)?current:[...current,code]);
    pick(code);
    close();
  };
  // Show the ENTIRE documented MoM preset inventory, but disable sequences
  // not compatible with this draft's previous section trail.
  const moMPresets=getRegister4MoMPresetChoices(value);
  const documentedCodes=new Set<string>(REGISTER4_MOM_PRESETS.map(item=>item.code));
  const options=[
    {value:"__current__",label:value || t("register4.sectionChoose")},
    ...candidates.filter(code=>!documentedCodes.has(code)).map(code=>{
      const x=known.find(row=>row.code===code);
      return {value:"__pick__:"+code,label:code+" — "+(x?(bn?x.bn:x.en):t("register4.sectionCustomLabel"))};
    }),
    ...moMPresets.map(item=>({
      value:"__pick__:"+item.code,
      label:item.code+" — "+(bn?item.bn:item.en),
      disabled:item.status==="BLOCKED",
    })),
    ...draftCodes.filter(code=>!candidates.includes(code)&&!documentedCodes.has(code))
      .map(code=>({value:"__pick__:"+code,label:code+" — "+t("register4.sectionCustomLabel") })),
  ];
  return (
    <div className="register4-section-field">
      <div className="register4-section-field__select">
        <AppSelectField id={id} label={label} value="__current__"
          onChange={option=>option.startsWith("__pick__:")&&pick(option.slice(9))}
          options={options} helper={error||helper} error={error} required={required} compact={compact}/>
      </div>
      <div className="register4-section-field__addition" ref={addAnchor}>
        <span className="register4-section-field__rule" aria-hidden="true" />
        <SecondaryButton icon={Plus} size="sm" className="register4-section-field__add"
          onClick={()=>{setOpen(true);setIssue("");}}>{t("register4.sectionAddNew")}</SecondaryButton>
      </div>
      {issue&&!open&&<p role="alert" className="register4-section-field__error">{issue}</p>}
      {editor==="inline" && open && (
        <div className="register4-section-field__inline-editor"
          role="group" aria-label={t("register4.sectionAddNew")}>
          <form onSubmit={event=>{event.preventDefault();event.stopPropagation();addCustom();}}>
            <div className="register4-section-field__inline-input">
              <AppTextField id={id+"-custom"} label={t("register4.sectionCustomLabel")}
                value={custom} onChange={next=>{setCustom(next);setIssue("");}}
                error={issue||undefined} placeholder="182(4)" maxLength={24} compact/>
            </div>
            <div className="register4-section-field__actions">
              <SecondaryButton type="button" size="sm" onClick={close}>{t("register4.sectionCancel")}</SecondaryButton>
              <PrimaryButton type="submit" size="sm">{t("register4.sectionAdd")}</PrimaryButton>
            </div>
          </form>
        </div>
      )}
      {editor==="popover" && (
        <Popover open={open} anchorEl={addAnchor.current}
          onClose={close}
          anchorOrigin={{vertical:"bottom",horizontal:"right"}}
          transformOrigin={{vertical:"top",horizontal:"right"}}
          slotProps={{paper:{className:"register4-section-field__popover"}}}>
          <div className="register4-section-field__popover-content">
            <h3 className="register4-section-field__popover-title">{t("register4.sectionAddNew")}</h3>
            <form onSubmit={event=>{event.preventDefault();event.stopPropagation();addCustom();}}>
              <AppTextField id={id+"-custom"} label={t("register4.sectionCustomLabel")}
                value={custom} onChange={next=>{setCustom(next);setIssue("");}}
                error={issue||undefined} placeholder="182(4)" maxLength={24} compact/>
              <div className="register4-section-field__actions">
                <SecondaryButton type="button" size="sm" onClick={close}>{t("register4.sectionCancel")}</SecondaryButton>
                <PrimaryButton type="submit" size="sm">{t("register4.sectionAdd")}</PrimaryButton>
              </div>
            </form>
          </div>
        </Popover>
      )}
    </div>
  );
}
