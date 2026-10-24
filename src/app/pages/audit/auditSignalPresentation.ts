/**
 * Officer-facing explanations of the existing A–E audit signal definitions.
 * These are writing overlays, NOT executable legal rules, trigger values or findings.
 * Keep both languages together and preserve the exact signal IDs.
 */
export interface AuditSignalContext {
  scope: "taxpayer" | "population";
  assessmentYear?: string;
  returnId?: string;
  coverageTier?: string;
  dataQuality?: string;
  auditStatus?: string;
  count?: number;
  total?: number;
  filterContext?: string;
}

type Pair = { en: string; bn: string };
const pair = (en: string, bn: string): Pair => ({ en, bn });

const questions: Record<string, Pair> = {
  "R-A1": pair("Does this return show assets even though income and tax payable are zero?", "আয় ও প্রদেয় কর শূন্য হলেও কি এই রিটার্নে সম্পদ দেখানো হয়েছে?"),
  "R-A2": pair("Is income declared but the calculated tax payable is zero?", "আয় দেখানো হলেও কি প্রদেয় কর শূন্য?"),
  "R-A3": pair("Does the income suggested by tax deducted at source exceed the income declared for that source?", "উৎসে কাটা কর অনুযায়ী আয় কি ঘোষিত আয়ের চেয়ে বেশি মনে হচ্ছে?"),
  "R-B1": pair("Have declared assets risen sharply since the previous year, under an approved comparison rule?", "অনুমোদিত তুলনার নিয়ম অনুযায়ী গত বছরের চেয়ে ঘোষিত সম্পদ কি অনেক বেড়েছে?"),
  "R-B2": pair("Did income fall while declared assets grew in the same year?", "একই বছরে আয় কমলেও কি ঘোষিত সম্পদ বেড়েছে?"),
  "R-C1": pair("Do the assets declared in IT-10B match the wealth explained by income, spending and other recorded sources?", "আইটি-১০বি-তে ঘোষিত সম্পদের সঙ্গে আয়, ব্যয় ও অর্থের উৎসের হিসাব কি মিলছে?"),
  "R-C2": pair("Has a sizeable unexplained difference continued or built up across several years?", "বেশ কয়েক বছর ধরে কি বড় ধরনের হিসাবের অমিল চলছে বা জমছে?"),
  "R-C3": pair("Does this year's opening wealth match last year's closing wealth?", "এ বছরের শুরুর সম্পদ কি গত বছরের শেষের সম্পদের সঙ্গে মেলে?"),
  "R-C4": pair("Is the declared household spending unusually low or sharply lower than before?", "ঘোষিত পারিবারিক ব্যয় কি অস্বাভাবিকভাবে কম, বা আগের চেয়ে হঠাৎ অনেক কমেছে?"),
  "R-D1": pair("Have zero income or zero tax declarations repeated over several years?", "বেশ কয়েক বছর ধরে কি আয় বা কর শূন্য দেখানো হচ্ছে?"),
  "R-D2": pair("Do income, assets and spending show a repeated unusual pattern across years?", "বছরের পর বছর আয়, সম্পদ ও ব্যয়ে কি অস্বাভাবিক ওঠানামা দেখা যাচ্ছে?"),
  "R-D3": pair("Was the return changed soon after a review flag, within the applicable review period?", "যাচাইয়ের সংকেত আসার কিছুদিনের মধ্যে কি রিটার্ন সংশোধন করা হয়েছে?"),
  "R-E1": pair("Does an authorized employer or third-party record show more income than the return?", "অনুমোদিত নিয়োগকর্তা বা তৃতীয় পক্ষের তথ্য কি রিটার্নের চেয়ে বেশি আয় দেখাচ্ছে?"),
  "R-E2": pair("Does an authorized asset registry show property missing from the return or recorded at a different value?", "অনুমোদিত সম্পদ নিবন্ধনের তথ্য কি রিটার্নে না-দেখানো সম্পদ বা ভিন্ন মূল্য দেখাচ্ছে?"),
  "R-E3": pair("Does VAT turnover differ from the business figures declared in the return?", "ভ্যাটে দেখানো বিক্রির হিসাব কি রিটার্নে ঘোষিত ব্যবসার হিসাবের সঙ্গে মিলছে না?"),
};

const copy = {
  title: pair("How this signal is checked", "এই সংকেত কীভাবে যাচাই হয়"),
  single: pair("This taxpayer", "এই করদাতা"),
  group: pair("Selected returns", "নির্বাচিত রিটার্নসমূহ"),
  first: pair("Check the available records", "যে তথ্য আছে তা যাচাই করুন"),
  second: pair("Check the signal condition", "সংকেতের শর্ত মিলিয়ে দেখুন"),
  third: pair("Compare the right figures", "সঠিক হিসাব তুলনা করুন"),
  evidence: pair("Check possible explanations", "সম্ভাব্য ব্যাখ্যা যাচাই করুন"),
  decision: pair("Record the review decision", "যাচাইয়ের সিদ্ধান্ত নথিবদ্ধ করুন"),
  separate: pair("This is the question being checked:", "এই বিষয়টি যাচাই করা হচ্ছে:"),
  missing: pair("Check missing or invalid inputs before continuing. Never treat a missing amount as zero.", "পরের ধাপের আগে অনুপস্থিত বা ভুল তথ্য ঠিক করুন। তথ্য না থাকলে শূন্য ধরবেন না।"),
  available: pair("The data-quality label is Complete. Check that this signal's required documents and values are actually present.", "তথ্যের মান ‘সম্পূর্ণ’ দেখাচ্ছে। এই সংকেতের প্রয়োজনীয় কাগজ ও সংখ্যাগুলো সত্যিই আছে কি না দেখুন।"),
  unknown: pair("Data completeness has not been confirmed for this signal. Check its required records first.", "এই সংকেতের জন্য সব তথ্য আছে কি না নিশ্চিত নয়। আগে প্রয়োজনীয় নথি দেখুন।"),
  check: pair("Compare the filed figures for the correct year. A signal label alone does not prove that the condition is met.", "সঠিক বছরের রিটার্নের সংখ্যাগুলো মিলিয়ে দেখুন। শুধু সংকেতের নাম দেখে শর্ত পূরণ হয়েছে বলা যায় না।"),
  c1Compare: pair("In IT-10B, subtract wealth explained by funds (line 7) from separately totaled assets (line 10). Check both totals against the filed statement. The dashboard's source-of-funds difference is a separate measure.", "আইটি-১০বি-তে আলাদাভাবে হিসাব করা মোট সম্পদ (লাইন ১০) থেকে তহবিলের হিসাব অনুযায়ী সম্পদ (লাইন ৭) বাদ দিন। দাখিল করা বিবরণীর সঙ্গে মিলিয়ে দেখুন। ড্যাশবোর্ডে দেখানো অর্থের উৎসের পার্থক্য আলাদা হিসাব।"),
  c1Threshold: pair("If the difference is confirmed, compare it only with the approved rule for the correct year. Without the approved limit, leave the trigger undecided.", "অমিল নিশ্চিত হলে সঠিক বছরের অনুমোদিত নিয়মের সঙ্গে মিলিয়ে দেখুন। অনুমোদিত সীমা না থাকলে সংকেত চালু হয়েছে বলে সিদ্ধান্ত দেবেন না।"),
  reasons: pair("Possible explanation: ", "সম্ভাব্য ব্যাখ্যা: "),
  proof: pair("Check: ", "যাচাই করুন: "),
  evidencePending: pair("Need more evidence", "আরও প্রমাণ দরকার"),
  evidencePendingBody: pair("Keep this signal open for verification; do not record a finding.", "যাচাই চলমান রাখুন; চূড়ান্ত সিদ্ধান্ত দেবেন না।"),
  evidenceExplained: pair("Difference explained", "অমিলের ব্যাখ্যা পাওয়া গেছে"),
  evidenceExplainedBody: pair("Record the documents and why the concern was resolved.", "প্রমাণ ও অমিল মিটে যাওয়ার কারণ নথিবদ্ধ করুন।"),
  evidenceReview: pair("Concern supported", "উদ্বেগের পক্ষে প্রমাণ পাওয়া গেছে"),
  evidenceReviewBody: pair("Link independent evidence and send it for the required officer review.", "স্বাধীন প্রমাণ যুক্ত করে কর্মকর্তার পরবর্তী পর্যালোচনায় পাঠান।"),
  officer: pair("Review the documents, avoid counting the same fact twice, and record the officer's reasoned decision. A signal alone is not an audit finding.", "নথি যাচাই করুন, একই তথ্য দুবার গণনা করবেন না এবং কর্মকর্তার সিদ্ধান্তের কারণ লিখুন। শুধু সংকেত মানেই নিরীক্ষার সিদ্ধান্ত নয়।"),
  singleContext: pair("Assessment year", "করবর্ষ"),
  returnId: pair("Return", "রিটার্ন"),
  quality: pair("Data quality", "তথ্যের মান"),
  coverage: pair("Available-data level", "প্রাপ্ত তথ্যের স্তর"),
  notProven: pair("Condition needs document review", "নথি যাচাই ছাড়া শর্ত নিশ্চিত নয়"),
  groupDetail: pair("This count covers the current filtered list, not one taxpayer. Each return has its own data availability and must be checked separately.", "এটি বর্তমান ফিল্টারে থাকা রিটার্নের হিসাব; একজন করদাতার নয়। প্রতিটি রিটার্নের তথ্য আলাদা করে যাচাই করতে হবে।"),
  filtered: pair("Filter", "ফিল্টার"),
  unknownCount: pair("Open a taxpayer record to check its data and the signal condition.", "তথ্য ও শর্ত যাচাই করতে করদাতার রিটার্ন খুলুন।"),
  noNumeric: pair("Exact calculation and approved rule details", "সঠিক হিসাব ও অনুমোদিত নিয়মের বিস্তারিত"),
  c1Formula: pair("IT-10B sources: income, exempt income, gifts/other receipts. Funds-based wealth = prior net wealth + sources − expenditure/loss + personal liabilities. Separately total the asset entries and related asset line. R-C1 gap = IT-10B line 10 − line 7. Check the underlying filed entries and avoid double counting.", "আইটি-১০বি: আয়, করমুক্ত আয়, উপহার ও অন্যান্য প্রাপ্তি যোগ করে অর্থের উৎস বের করুন। আগের নিট সম্পদের সঙ্গে উৎস যোগ, ব্যয়/ক্ষতি বাদ এবং ব্যক্তিগত দায় যোগ করে তহবিলভিত্তিক সম্পদ বের করুন। সম্পদের অংশগুলো আলাদা করে যোগ করুন। R-C1 অমিল = লাইন ১০ − লাইন ৭। দাখিল করা তথ্য ও দ্বৈত গণনা যাচাই করুন।"),
  noAuthority: pair("Do not apply a percentage, amount or legal conclusion unless its approved rule, effective year and source records are available.", "অনুমোদিত নিয়ম, প্রযোজ্য বছর ও মূল তথ্য না থাকলে কোনো শতকরা হার, টাকা বা আইনি সিদ্ধান্ত প্রয়োগ করবেন না।"),
} satisfies Record<string, Pair>;

export function auditSignalText(key: keyof typeof copy, language: string): string {
  return copy[key][language.toLowerCase().startsWith("bn") ? "bn" : "en"];
}

export function auditSignalQuestion(signalId: string, language: string): string | null {
  const pairValue = questions[signalId];
  return pairValue ? pairValue[language.toLowerCase().startsWith("bn") ? "bn" : "en"] : null;
}

export const AUDIT_SIGNAL_IDS = Object.freeze(Object.keys(questions));
