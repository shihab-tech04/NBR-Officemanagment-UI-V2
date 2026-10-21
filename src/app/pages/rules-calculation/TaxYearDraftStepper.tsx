import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, ClipboardList, Download, FileCheck2 } from "lucide-react";
import { AppModal } from "../../components/modals/AppModal";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextField } from "../../components/forms/AppTextField";
import { AppDateField } from "../../components/forms/AppDateField";
import { AppTextArea } from "../../components/forms/AppTextArea";
import { SQL_RULE_GROUPS, TAX_YEAR_SNAPSHOT } from "../../data/rulesEngineSnapshot";
import {
  CANDIDATE_IMPACTS, LEGAL_EFFECTS, createDraftReviewPackage, freshDraftInput, freshProvisionCandidate,
  isValidCustomRuleId, type CandidateImpact, type CandidateLegalEffect,
  type DraftDocumentEvidence, type TaxYearDraftInput, type DraftProvisionCandidate, type DraftRuleLevel, type DraftHierarchyBasis,
} from "../../data/taxYearDraftModel";
import ruleSnapshot from "../../data/rulesSqlSnapshot.json";

const catalog = ruleSnapshot.rules;
const canonicalIds = new Set(catalog.map(rule => rule.id));
const stepLabels: [string, string][] = [
  ["Tax year & baseline", "করবর্ষ ও ভিত্তি"], ["Select & propose rules", "বিধি নির্বাচন ও প্রস্তাব"],
  ["Official source intake", "সরকারি উৎস গ্রহণ"], ["Legal change review", "আইনি পরিবর্তন পর্যালোচনা"],
  ["Impact analysis", "প্রভাব বিশ্লেষণ"], ["Review & export draft", "পর্যালোচনা ও খসড়া রপ্তানি"],
];

interface Props { onClose: () => void; }

/** Client-only preparation of a review artifact. This page NEVER creates or activates SQL rows. */
export function TaxYearDraftStepper({ onClose }: Props) {
  const { i18n } = useTranslation();
  const bn = i18n.language.startsWith("bn");
  const tr = (en: string, translated: string) => bn ? translated : en;
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState<TaxYearDraftInput>(freshDraftInput);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [provision, setProvision] = useState<DraftProvisionCandidate>(freshProvisionCandidate);
  const [candidatePurpose, setCandidatePurpose] = useState("");
  const [url, setUrl] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [commencement, setCommencement] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const existingDraft = TAX_YEAR_SNAPSHOT.find(x => x.assessmentYear === draft.targetYear);
  const filteredRules = useMemo(() => catalog.filter(r =>
    (!group || r.group === group) && (!search || [r.id, r.group, r.source ?? "", ...r.legalSource].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  ), [search, group]);
  const selected = new Set(draft.selectedRuleIds);
  const selectedFiltered = filteredRules.filter(r => selected.has(r.id));
  const update = (patch: Partial<TaxYearDraftInput>) => { setDraft(prev => ({ ...prev, ...patch })); setStatusMessage(""); };
  const switchRule = (id: string, enabled: boolean) => {
    update({ selectedRuleIds: enabled ? Array.from(new Set([...draft.selectedRuleIds, id])) : draft.selectedRuleIds.filter(x => x !== id) });
  };
  const switchImpact = (id: CandidateImpact, enabled: boolean) => {
    update({ proposedImpacts: enabled ? Array.from(new Set([...draft.proposedImpacts, id])) : draft.proposedImpacts.filter(x => x !== id) });
  };
  const patchProvision = (patch: Partial<DraftProvisionCandidate>) =>
    setProvision(previous => ({ ...previous, ...patch }));
  const addProvisionCandidate = () => {
    try {
      const next = { ...draft, proposedProvisions: [...draft.proposedProvisions, { ...provision }] };
      createDraftReviewPackage(next, canonicalIds);
      update({ proposedProvisions: next.proposedProvisions,
        selectedRuleIds: Array.from(new Set([...draft.selectedRuleIds, provision.ruleId])) });
      setProvision(freshProvisionCandidate());
      setStatusMessage(tr("Source-linked draft added. SQL unchanged.", "উৎস-সংযুক্ত খসড়া যোগ হয়েছে। SQL অপরিবর্তিত।"));
    } catch (error) { setStatusMessage(error instanceof Error ? error.message : String(error)); }
  };
  const addCustomRule = () => {
    const id = candidateId.trim().toUpperCase();
    if (!isValidCustomRuleId(id, canonicalIds, draft.customRules) || !candidatePurpose.trim()) {
      setStatusMessage(tr("Enter a new unique candidate ID and purpose; never overwrite a canonical ID.", "একটি অনন্য নতুন পরিচয় ও উদ্দেশ্য দিন; মূল বিধি পরিবর্তন করা যাবে না।"));
      return;
    }
    update({ customRules: [...draft.customRules, { candidateId: id, purpose: candidatePurpose.trim(), status: "PROPOSED" }] });
    setCandidateId(""); setCandidatePurpose("");
  };
  const intake = async (files: FileList | null) => {
    if (!files?.length) return;
    setDocumentError("");
    const entries: DraftDocumentEvidence[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 40 * 1024 * 1024) { setDocumentError(tr("Document exceeds the 40 MB intake limit.", "নথিটি ৪০ এমবি সীমা অতিক্রম করেছে।")); return; }
      const extension = file.name.toLowerCase().split(".").pop();
      if (extension !== "pdf" && extension !== "json") { setDocumentError(tr("Only PDF and JSON files are accepted.", "শুধু PDF ও JSON ফাইল গ্রহণযোগ্য।")); return; }
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (extension === "pdf" && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") { setDocumentError(tr("Invalid PDF header.", "PDF হেডার সঠিক নয়।")); return; }
      if (extension === "json") { try { JSON.parse(new TextDecoder().decode(bytes)); } catch { setDocumentError(tr("Invalid JSON syntax.", "JSON সিনট্যাক্স সঠিক নয়।")); return; } }
      const hash = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
      entries.push({ name: file.name, type: extension === "pdf" ? "PDF" : "JSON", sizeBytes: file.size, sha256, officialUrl: url.trim(), suppliedIssueDate: issueDate, suppliedCommencementDate: commencement, evidenceStatus: "UNVERIFIED", persisted: false });
    }
    update({ documents: [...draft.documents, ...entries] });
  };
  const getPackage = () => createDraftReviewPackage(draft, canonicalIds);
  const exportDraft = () => {
    try {
      const payload = getPackage();
      const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `NBR_TAX_YEAR_${draft.targetYear.replaceAll("-", "_")}_REVIEW_DRAFT.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setStatusMessage(tr("Review-only draft exported. Nothing was saved to SQL.", "পর্যালোচনার খসড়া রপ্তানি হয়েছে। SQL-এ কিছু সংরক্ষণ হয়নি।"));
    } catch (error) { setStatusMessage(error instanceof Error ? error.message : String(error)); }
  };

  const footer = (    <div className="rules-engine__wizard-actions"><SecondaryButton size="lg" onClick={() => stage === 0 ? onClose() : setStage(s=>s-1)} icon={ArrowLeft}>{stage===0?tr("Cancel", "বাতিল"):tr("Back", "পেছনে")}</SecondaryButton>{stage < 5 && <PrimaryButton size="lg" icon={stage===4?FileCheck2:ArrowRight} onClick={() => setStage(s=>Math.min(5,s+1))}>{tr("Next", "পরবর্তী")}</PrimaryButton>}{stage === 5 && <SecondaryButton size="lg" icon={ClipboardList} onClick={onClose}>{tr("Done reviewing", "পর্যালোচনা শেষ")}</SecondaryButton>}</div>);
  return <AppModal open={true} onClose={onClose} size="xl" title={tr("Prepare Tax Year", "করবর্ষের খসড়া প্রস্তুতি")} footer={footer}><section className="rules-engine__stepper" >
    <p className="rules-engine__scope" role="status">{tr("Draft only. Files stay in your browser; nothing is saved, legally approved or activated.", "শুধু খসড়া। ফাইল ব্রাউজারেই থাকে; SQL সংরক্ষণ, আইনি অনুমোদন বা হিসাব চালু হয় না।")}</p>
    <nav className="rules-engine__steps" aria-label={tr("Tax-year preparation steps", "করবর্ষ প্রস্তুতির ধাপ")}>
      {stepLabels.map(([en,bengali],i) => <button key={en} type="button" aria-current={stage === i ? "step" : undefined} disabled={i > stage} className={stage === i ? "rules-engine__step rules-engine__step--current" : "rules-engine__step"} onClick={() => setStage(i)}><span className="rules-engine__step-no">{i + 1}</span><p>{bn ? bengali : en}</p></button>)}
    </nav>
    <div className="rules-engine__panel rules-engine__wizard-panel">
      <h2 className="rules-engine__heading">{bn ? stepLabels[stage][1] : stepLabels[stage][0]}</h2>
      {stage === 0 && <div className="rules-engine__wizard-grid">
        <AppTextField compact id="tax-year-target" label={tr("Target assessment year", "প্রস্তাবিত করবর্ষ")} readOnly value={draft.targetYear} onChange={() => undefined}/>
        <AppTextField compact id="tax-year-income" label={tr("Income year", "আয়বর্ষ")} readOnly value={draft.incomeYear} onChange={() => undefined}/>
        <AppTextField compact id="tax-year-base" label={tr("Controlled source AY", "নিয়ন্ত্রিত উৎস করবর্ষ")} readOnly value={draft.baseYear} onChange={() => undefined}/>
        <AppDateField compact id="tax-year-cutoff" label={tr("Proposed legal cutoff (unverified)", "প্রস্তাবিত আইনি কাটঅফ (অযাচাইকৃত)")} value={draft.legalCutoff} onChange={(v) => update({ legalCutoff: v })}/>
        <div className="rules-engine__wide"><p>{tr(`2026-10-10 snapshot year state: ${existingDraft?.dbState ?? "UNKNOWN"}. All 366 inherited versions remain pending review.`, `১০ অক্টোবর ২০২৬-এর স্ন্যাপশট বর্ষ: ${existingDraft?.dbState ?? "অজানা"}। ৩৬৬টি উত্তরাধিকারী সংস্করণ পর্যালোচনাধীন।`)}</p></div>
      </div>}
      {stage === 1 && <>
        <p>{tr("Select the canonical IDs needing legal comparison. Selecting a rule does not authorize execution.", "যেসব মূল বিধির আইনি তুলনা দরকার সেগুলো নির্বাচন করুন। নির্বাচনে হিসাব অনুমোদিত হয় না।")}</p>
        <div className="rules-engine__filters"><AppSearchField label={tr("Search canonical rules", "মূল বিধি খুঁজুন")} value={search} onChange={setSearch}/>
          <AppSelectField id="stepper-rule-group" compact label={tr("Administrative group", "প্রশাসনিক গ্রুপ")} value={group} onChange={setGroup} searchableAfter={5} options={[{value:"",label:tr("All groups","সব গ্রুপ")},...SQL_RULE_GROUPS.map(g => ({value:g.id,label:bn?g.bn:g.en}))]}/></div>
        <p>{tr(`${draft.selectedRuleIds.length} selected of ${catalog.length}; ${filteredRules.length} matching`, `${draft.selectedRuleIds.length}টি নির্বাচিত, মোট ${catalog.length}; মিলেছে ${filteredRules.length}টি`)}</p>
        <div className="rules-engine__wizard-actions"><SecondaryButton size="lg" onClick={() => update({ selectedRuleIds: Array.from(new Set([...draft.selectedRuleIds, ...filteredRules.map(r => r.id)])) })}>{tr("Select all filtered", "ফিল্টার করা সব নির্বাচন")}</SecondaryButton><SecondaryButton size="lg" onClick={() => update({ selectedRuleIds: draft.selectedRuleIds.filter(id => !filteredRules.some(r => r.id === id)) })}>{tr("Clear filtered", "ফিল্টার করা নির্বাচন বাদ")}</SecondaryButton></div>
        <div className="rules-engine__rule-list" role="group" aria-label={tr("Canonical rule selection", "মূল বিধি নির্বাচন")}>{filteredRules.slice(0, 100).map(r => <label className="rules-engine__rule-row" key={r.id}><input type="checkbox" checked={selected.has(r.id)} onChange={e => switchRule(r.id, e.target.checked)}/><span><strong>{r.id}</strong><small>{r.legalSource.join("; ") || r.source || tr("No source recorded", "উৎস নেই")}</small></span></label>)}</div>
        {filteredRules.length > 100 && <p>{tr("Showing first 100 matches; filter to inspect others or select all filtered.", "প্রথম ১০০টি ফল দেখানো হয়েছে; বাকিগুলো ফিল্টার করুন বা একসঙ্গে নির্বাচন করুন।")}</p>}
        <h3>{tr("Propose a new custom rule", "নতুন কাস্টম বিধি প্রস্তাব")}</h3>
        <div className="rules-engine__wizard-grid"><AppTextField compact id="candidate-id" label={tr("Unique proposal ID", "অনন্য প্রস্তাব পরিচয়")} value={candidateId} onChange={setCandidateId}/><AppTextField compact id="candidate-purpose" label={tr("Purpose / scope", "উদ্দেশ্য / পরিসর")} value={candidatePurpose} onChange={setCandidatePurpose}/></div>
        <SecondaryButton size="lg" onClick={addCustomRule}>{tr("Add proposed rule", "প্রস্তাবিত বিধি যোগ")}</SecondaryButton>
        {draft.customRules.map(r => <p key={r.candidateId}>{r.candidateId} · PROPOSED · {r.purpose} <button type="button" onClick={() => update({customRules:draft.customRules.filter(x=>x.candidateId!==r.candidateId)})}>{tr("Remove", "বাদ দিন")}</button></p>)}
      </>}
      {stage === 2 && <>
        <p>{tr("Choose original official PDFs or JSON extracts. Only a checksum and user-entered provenance are retained in the local draft. JSON/OCR is never controlling law.", "সরকারি মূল PDF বা JSON নির্যাস বাছুন। স্থানীয় খসড়ায় কেবল হ্যাশ ও দেওয়া উৎসতথ্য থাকবে। JSON/OCR নিজে আইন নয়।")}</p>
        <div className="rules-engine__wizard-grid"><AppTextField compact id="intake-official-url" label={tr("Source URL (unverified)", "উৎস URL (অযাচাইকৃত)")} value={url} onChange={setUrl} placeholder="https://nbr.gov.bd/..."/><AppDateField compact id="intake-issue-date" label={tr("Issue or Gazette date (as supplied)", "প্রকাশ বা গেজেটের তারিখ (দেওয়া তথ্য)")} value={issueDate} onChange={setIssueDate}/><AppDateField compact id="intake-commencement-date" label={tr("Commencement date (as supplied)", "কার্যকারিতার তারিখ (দেওয়া তথ্য)")} value={commencement} onChange={setCommencement}/><div><label htmlFor="intake-file">{tr("Select local evidence files", "স্থানীয় প্রমাণ ফাইল বাছুন")}</label><input id="intake-file" type="file" multiple accept=".pdf,.json,application/pdf,application/json" onChange={e => { void intake(e.target.files); e.target.value=""; }}/></div></div>
        {documentError && <p role="alert">{documentError}</p>}
        {draft.documents.map((d,i)=><div key={`${d.sha256}-${i}`} className="rules-engine__evidence"><p><strong>{d.name}</strong> · {d.type} · {d.sizeBytes} bytes · UNVERIFIED</p><p className="rules-engine__hash">SHA-256: {d.sha256}</p><SecondaryButton size="lg" onClick={() => update({documents:draft.documents.filter((_,idx)=>i!==idx)})}>{tr("Remove", "বাদ দিন")}</SecondaryButton></div>)}
      </>}
      {stage === 3 && <>
        <p>{tr("The software has not extracted, compared, or approved legal text. Categorize a proposed change for later human review only.", "সফটওয়্যার আইনের পাঠ তুলনা বা অনুমোদন করেনি। ভবিষ্যৎ মানবিক পর্যালোচনার জন্য প্রস্তাবের ধরন নির্ধারণ করুন।")}</p>
        <div className="rules-engine__wizard-grid"><AppSelectField id="proposed-effect" label={tr("Proposed legal effect", "প্রস্তাবিত আইনি প্রভাব")} value={draft.legalEffect} onChange={v=>update({legalEffect:v as CandidateLegalEffect})} options={LEGAL_EFFECTS.map(v=>({value:v,label:v}))}/><AppTextArea id="change-notes" rows={5} label={tr("Legal comparison review notes", "আইনি তুলনার পর্যালোচনা মন্তব্য")} value={draft.changeNote} onChange={(v)=>update({changeNote:v})}/></div>

        <h3>{tr("Propose source-linked parent / subrule / child", "উৎস-সংযুক্ত মূল / উপবিধি / অধীন বিধি প্রস্তাব")}</h3>
        <p className="rules-engine__scope">{tr("Original PDF required. Every proposed value remains UNVERIFIED; JSON/OCR cannot certify law. No SQL writes.", "মূল PDF আবশ্যক। সব প্রস্তাবিত তথ্য অযাচাইকৃত; JSON/OCR আইন অনুমোদন করে না। SQL অপরিবর্তিত।")}</p>
        <div className="rules-engine__wizard-grid">
          <AppTextField compact id="candidate-change-id" label={tr("Unique proposal ID", "অনন্য প্রস্তাব আইডি")} value={provision.proposalId} onChange={v=>patchProvision({proposalId:v.trim().toUpperCase()})}/>
          <AppSelectField compact id="candidate-rule-id" label={tr("Linked rule ID", "সংযুক্ত বিধি আইডি")} value={provision.ruleId} onChange={v=>patchProvision({ruleId:v})} searchableAfter={5} options={[{value:"",label:tr("Choose a rule", "বিধি বাছুন")},...catalog.map(r=>({value:r.id,label:r.id})),...draft.customRules.map(r=>({value:r.candidateId,label:r.candidateId}))]}/>
          <AppSelectField compact id="candidate-parent-id" label={tr("Parent rule", "মূল বিধি")} value={provision.parentRuleId} onChange={v=>patchProvision({parentRuleId:v})} searchableAfter={5} options={[{value:"",label:tr("No parent", "মূল বিধি নেই")},...catalog.map(r=>({value:r.id,label:r.id})),...draft.customRules.map(r=>({value:r.candidateId,label:r.candidateId}))]}/>
          <AppSelectField compact id="candidate-level" label={tr("Rule hierarchy", "বিধি শ্রেণি")} value={provision.level} onChange={v=>patchProvision({level:v as DraftRuleLevel})} options={["PARENT","SUBRULE","CHILD"].map(v=>({value:v,label:v}))}/>
          <AppSelectField compact id="candidate-hierarchy-basis" label={tr("Hierarchy basis", "শ্রেণিবিন্যাসের ভিত্তি")} value={provision.hierarchyBasis} onChange={v=>patchProvision({hierarchyBasis:v as DraftHierarchyBasis})} options={[{value:"STATUTORY",label:tr("Statutory", "আইনি")},{value:"ADMINISTRATIVE",label:tr("Administrative (not law)", "প্রশাসনিক (আইন নয়)")}]}/>
          <AppSelectField compact id="candidate-pdf" label={tr("Original PDF evidence", "মূল PDF প্রমাণ")} value={provision.sourcePdfSha256} onChange={v=>patchProvision({sourcePdfSha256:v})} searchableAfter={5} options={[{value:"",label:tr("Select an attached PDF", "সংযুক্ত PDF বাছুন")},...draft.documents.filter(d=>d.type==="PDF").map(d=>({value:d.sha256,label:d.name+" / "+d.sha256.slice(0,12)}))]}/>
          <AppTextField compact id="candidate-source-id" label={tr("Official source ID", "সরকারি উৎস আইডি")} value={provision.sourceId} onChange={v=>patchProvision({sourceId:v})}/>
          <AppTextField compact id="candidate-locator" label={tr("Page, clause and locator", "পৃষ্ঠা, ধারা ও অবস্থান")} value={provision.provisionLocator} onChange={v=>patchProvision({provisionLocator:v})}/>
          <AppDateField compact id="candidate-issued" label={tr("Issue date (unverified)", "প্রকাশের তারিখ (অযাচাইকৃত)")} value={provision.issueDate} onChange={v=>patchProvision({issueDate:v})}/>
          <AppDateField compact id="candidate-effective" label={tr("Effective date (unverified)", "কার্যকারিতা (অযাচাইকৃত)")} value={provision.effectiveDate} onChange={v=>patchProvision({effectiveDate:v})}/>
        </div>
        <div className="rules-engine__comparison">
          <article className="rules-engine__panel"><h3>{tr("Original / old legal text", "মূল / পূর্ববর্তী আইনি পাঠ")}</h3><AppTextArea id="candidate-old-text" rows={5} label={tr("Unverified transcription", "অযাচাইকৃত প্রতিলিপি")} value={provision.previousText} onChange={v=>patchProvision({previousText:v})}/></article>
          <article className="rules-engine__panel"><h3>{tr("New / amended legal text", "নতুন / সংশোধিত আইনি পাঠ")}</h3><AppTextArea id="candidate-new-text" rows={5} label={tr("Proposed text", "প্রস্তাবিত পাঠ")} value={provision.proposedText} onChange={v=>patchProvision({proposedText:v})}/></article>
        </div>
        <div className="rules-engine__wizard-grid">
          <AppTextArea id="candidate-savings" rows={3} label={tr("Savings / transition", "সংরক্ষণ / অন্তর্বর্তী বিধান")} value={provision.savingsText} onChange={v=>patchProvision({savingsText:v})}/>
          <AppTextArea id="candidate-taxpayers" rows={3} label={tr("Taxpayer and AY/IY scope", "করদাতা ও করবর্ষ/আয়বর্ষ")} value={provision.taxpayerScope} onChange={v=>patchProvision({taxpayerScope:v})}/>
          <AppTextArea id="candidate-facts" rows={3} label={tr("Applicability facts / exclusions", "প্রযোজ্যতা / বর্জন")} value={provision.triggeringFacts} onChange={v=>patchProvision({triggeringFacts:v})}/>
          <AppTextArea id="candidate-formula" rows={3} label={tr("Proposed rate / formula (not executable)", "প্রস্তাবিত হার / সূত্র (কার্যকর নয়)")} value={provision.rateOrFormula} onChange={v=>patchProvision({rateOrFormula:v})}/>
          <AppTextArea id="candidate-exemptions" rows={3} label={tr("Exception / exemption", "ব্যতিক্রম / অব্যাহতি")} value={provision.exemptionOrException} onChange={v=>patchProvision({exemptionOrException:v})}/>
          <AppSelectField compact id="candidate-review-state" label={tr("Review state", "পর্যালোচনার অবস্থা")} value={provision.reviewState} onChange={v=>patchProvision({reviewState:v as "PROPOSED"|"CONFLICT"})} options={[{value:"PROPOSED",label:"PROPOSED / OPEN"},{value:"CONFLICT",label:"CONFLICT / BLOCKED"}]}/>
        </div>
        <p>{tr("Possible downstream impacts (always OPEN)", "সম্ভাব্য প্রভাব (সব সময় OPEN)")}</p>
        <div className="rules-engine__impact-grid">{CANDIDATE_IMPACTS.map(id=><label key={id} className="rules-engine__impact-row"><input type="checkbox" checked={provision.impacts.includes(id)} onChange={e=>patchProvision({impacts:e.target.checked?[...provision.impacts,id]:provision.impacts.filter(x=>x!==id)})}/><span>{id.toUpperCase()} · OPEN</span></label>)}</div>
        <SecondaryButton size="lg" onClick={addProvisionCandidate}>{tr("Add proposed provision (local only)", "প্রস্তাবিত বিধান যোগ (শুধু স্থানীয়)")}</SecondaryButton>
        {draft.proposedProvisions.map(p=><article className="rules-engine__evidence" key={p.proposalId}><h3>{p.proposalId} · {p.reviewState}</h3>
          <p>{p.ruleId} · {p.level} · {p.hierarchyBasis} · {p.sourceId} / {p.provisionLocator}</p>
          <p>{tr("PDF SHA-256", "PDF SHA-256")}: {p.sourcePdfSha256} · {tr("UNVERIFIED / SQL NOT PERSISTED", "অযাচাইকৃত / SQL-এ সংরক্ষিত নয়")}</p>
          <SecondaryButton size="lg" onClick={()=>update({proposedProvisions:draft.proposedProvisions.filter(x=>x.proposalId!==p.proposalId)})}>{tr("Remove proposal", "প্রস্তাব বাদ দিন")}</SecondaryButton></article>)}
        <p>{tr(`Evidence attached: ${draft.documents.length}; selected rule candidates: ${draft.selectedRuleIds.length}. Actual original-versus-amended text verification remains OPEN.`, `প্রমাণ: ${draft.documents.length}; বিধি প্রার্থী: ${draft.selectedRuleIds.length}। মূল ও সংশোধিত পাঠের প্রকৃত যাচাই এখনও বাকি।`)}</p>
      </>}
      {stage === 4 && <>
        <p>{tr("Mark possible downstream impacts. These are OPEN candidates, not confirmed impact mappings.", "সম্ভাব্য প্রভাব চিহ্নিত করুন। এগুলো উন্মুক্ত প্রার্থী, নিশ্চিত প্রভাব নয়।")}</p>
        <div className="rules-engine__impact-grid">{CANDIDATE_IMPACTS.map(id=><label key={id} className="rules-engine__impact-row"><input type="checkbox" checked={draft.proposedImpacts.includes(id)} onChange={e=>switchImpact(id,e.target.checked)}/><span>{id.toUpperCase()} · OPEN</span></label>)}</div>
      </>}
      {stage === 5 && <>
        <p>{tr("Review the immutable baseline and your draft before exporting a local review package. SQL is not changed.", "স্থানীয় খসড়া রপ্তানির আগে মূল ভিত্তি ও প্রস্তাব যাচাই করুন। SQL অপরিবর্তিত।")}</p>
        <div className="rules-engine__comparison"><article className="rules-engine__panel"><h3>{tr("Version & selection", "সংস্করণ ও নির্বাচন")}</h3><p>AY {draft.targetYear} / IY {draft.incomeYear}</p><p>{tr("Selected canonical IDs", "নির্বাচিত মূল বিধি")}: {draft.selectedRuleIds.length} / 366</p><p>{tr("Custom proposals", "কাস্টম প্রস্তাব")}: {draft.customRules.length}</p><p>{tr("Source evidence", "উৎস প্রমাণ")}: {draft.documents.length}</p><p>{tr("Provision proposals (OPEN)", "বিধান প্রস্তাব (OPEN)")}: {draft.proposedProvisions.length}</p></article>
          <article className="rules-engine__panel"><h3>{tr("Fail-closed disposition", "নিরাপদ অবরুদ্ধ অবস্থা")}</h3><p>DRAFT / INHERITED_PENDING_REVIEW</p><p>UNVERIFIED / NOT_CERTIFIED</p><p>{tr("Impacts requiring review", "পর্যালোচনাধীন প্রভাব")}: {draft.proposedImpacts.length}</p><p>{tr("SQL writes", "SQL পরিবর্তন")}: 0</p></article></div>
        <PrimaryButton size="lg" icon={Download} onClick={exportDraft}>{tr("Export review-only DRAFT JSON", "পর্যালোচনামূলক খসড়া JSON রপ্তানি")}</PrimaryButton>
        <p className="rules-engine__scope">{tr("This is not a statutory rule publication, not an official-document upload, and not SQL persistence. A protected service must verify and save reviewed evidence separately.", "এটি বিধি প্রকাশ, সরকারি নথি আপলোড বা SQL সংরক্ষণ নয়। সুরক্ষিত সেবা পৃথকভাবে প্রমাণ যাচাই ও সংরক্ষণ করবে।")}</p>
      </>}
    </div>
    {statusMessage && <p role="status" className="rules-engine__meta">{statusMessage}</p>}

  </section></AppModal>;
}
