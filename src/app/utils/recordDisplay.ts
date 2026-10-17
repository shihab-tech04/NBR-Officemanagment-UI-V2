import { formatLocalizedDate } from "./localeFormatting";

/** Presentation-only translations; raw row values remain unchanged for sorting, filters and persistence. */
const VALUE_KEYS: Record<string, string> = {
  Normal:"normal",Online:"online",Offline:"offline",Pending:"pending",Approved:"approved",Rejected:"rejected",Verified:"verified",Resolved:"resolved",Transferred:"transferred",Cancelled:"cancelled",Issued:"issued",Active:"active",Inactive:"inactive",
  "Under Review":"underReview","In Progress":"inProgress",Matched:"matched",Mismatched:"mismatched",Failed:"failed",Selected:"selected",Completed:"completed",Decided:"decided",Adjourned:"adjourned",Disbursed:"disbursed",Paid:"paid","Partially Paid":"partiallyPaid",Unpaid:"unpaid",Dormant:"dormant",Never:"never",
  "Record entered":"recordEntered","Assessment reviewed":"assessmentReviewed","Adjustment noted":"adjustmentNoted","Entry updated":"entryUpdated","Duplicate TIN":"duplicateTin","Wrong AY":"wrongAy","Missing Signature":"missingSignature","Format Error":"formatError","System Auto-Check":"systemAutoCheck","Manual Review":"manualReview","Wrong filing":"wrongFiling","Taxpayer request":"taxpayerRequest","Taxpayer Request":"taxpayerRequest","Jurisdictional Change":"jurisdictionalChange","Admin Order":"adminOrder","Wrong Circle":"wrongCircle","Wrong Zone":"wrongZone",
  System:"system",Officer:"officer",TIN:"tin",Amount:"amount",Date:"date",Assessment:"assessment",Penalty:"penalty",Appeal:"appeal","Assessment Error":"assessmentError","Penalty Waiver":"penaltyWaiver","Income Certificate":"incomeCertificate","Tax Clearance":"taxClearance","No Dues Certificate":"noDuesCertificate","Return Submission":"returnSubmission","Document Submission":"documentSubmission",Hearing:"hearing","Return View":"returnView","PSR Entry":"psrEntry","Edit Request":"editRequest","TDS Refund":"tdsRefund","Advance Tax Refund":"advanceTaxRefund","Error Adjustment":"errorAdjustment","Previous Value":"previousValue","New Value":"newValue","Old Value":"oldValue",
  "Tax Commissioner":"taxCommissioner","Deputy Commissioner":"deputyCommissioner","Senior Commissioner":"seniorCommissioner","Circle Officer":"circleOfficer","Data Entry Operator":"dataEntryOperator",Admin:"admin",Viewer:"viewer","Return Data Entry":"returnDataEntry","Stock Manager":"stockManager","Case Manager":"caseManager","Report Analyst":"reportAnalyst",
  Returned:"returned",Disposed:"disposed",Suspended:"suspended",High:"high",Low:"low","Income Tax":"incomeTax",VAT:"vat","Tax Payment":"taxPayment","TDS Credit":"tdsCredit","Advance Tax":"advanceTax",Name:"name",Address:"address","Handed Over":"handedOver",Postal:"postal",Digital:"digital","Risk-Based":"riskBased",Random:"random","Special Order":"specialOrder","Sole Proprietorship":"soleProprietorship",Partnership:"partnership",Company:"company",NGO:"ngo",Trust:"trust",Society:"society",Foundation:"foundation","High Court":"highCourt","Supreme Court":"supremeCourt","Tax Tribunal":"taxTribunal",
};

export function localizeRecordValue(value: string, translate: (key: string) => string, language = "en"): string {
  const key = VALUE_KEYS[value];
  if (key) {
    const translationKey = `displayValues.${key}`;
    const label = translate(translationKey);
    if (label && label !== translationKey) return label;
  }
  if (/^৳\d+(?:\.\d+)?$/.test(value)) {
    return `৳${new Intl.NumberFormat(language.startsWith("bn") ? "bn-BD" : "en-BD").format(Number(value.slice(1)))}`;
  }
  if (language.startsWith("bn") && (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2} [A-Za-z]{3} \d{4}$/.test(value))) return formatLocalizedDate(value, language);
  return value;
}
