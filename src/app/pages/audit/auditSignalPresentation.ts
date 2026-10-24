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
  /** Displayed profile comparison, never accepted as independent source proof. */
  displayedFacts?: Array<{
    label: string;
    current: number;
    previous?: number;
    currentYear: string;
    previousYear?: string;
  }>;
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
  snapshot: pair("Figures in this taxpayer profile", "এই করদাতার প্রোফাইলের হিসাব"),
  change: pair("Change", "পরিবর্তন"),
  snapshotCaution: pair(
    "These are figures shown in the profile. Check the original return and supporting records before deciding whether the signal is confirmed.",
    "এগুলো প্রোফাইলে দেখানো হিসাব। সংকেত নিশ্চিত করার আগে মূল রিটার্ন ও প্রমাণপত্র মিলিয়ে দেখুন।"
  ),
  externalProof: pair(
    "The matching external record is not shown here. Obtain a dated record through the approved lawful process and check ownership or period first.",
    "মিলিয়ে দেখার বাইরের নথিটি এখানে নেই। অনুমোদিত বৈধ পদ্ধতিতে তারিখসহ নথি নিয়ে মালিকানা ও সময়কাল যাচাই করুন।"
  ),
  c1Separate: pair(
    "This source-of-funds comparison is separate from the IT-10B line 10 minus line 7 check. The filed IT-10B figures are required for an R-C1 decision.",
    "এখানে অর্থের উৎসের তুলনা দেখানো হয়েছে। R-C1 সিদ্ধান্তের জন্য মূল আইটি-১০বি-র লাইন ১০ থেকে লাইন ৭ বাদ দিয়ে আলাদা যাচাই দরকার।"
  ),
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


/** How to reproduce each recorded signal from the underlying documents. */
const recordChecks: Record<string, Pair> = {
  "R-A1": pair("Compare income (return line 11), payable tax (line 16) and assets (IT-10B line 10). Check that both return amounts are zero and declared assets are positive.", "রিটার্নের আয় (লাইন ১১), প্রদেয় কর (লাইন ১৬) ও আইটি-১০বি সম্পদ (লাইন ১০) মিলিয়ে দেখুন। আয় ও কর শূন্য, কিন্তু সম্পদ শূন্যের বেশি কি না যাচাই করুন।"),
  "R-A2": pair("Check whether return line 11 shows income while line 16 shows zero tax. Review rebates, exemptions and the applicable taxpayer category.", "রিটার্নের ১১ নম্বর লাইনে আয় এবং ১৬ নম্বর লাইনে শূন্য কর আছে কি না দেখুন। কর রেয়াত, করমুক্ত আয় ও করদাতার শ্রেণি যাচাই করুন।"),
  "R-A3": pair("Match each source-tax certificate to the same income source, rate, person and period. Compare its supported income with the income declared for that source.", "উৎসে কর কাটার সনদে আয়ের উৎস, হার, ব্যক্তি ও বছর মিলিয়ে দেখুন। সনদ অনুযায়ী আয় ও ঘোষিত আয় তুলনা করুন।"),
  "R-B1": pair("Compare the same asset totals in this year and the previous return. Review the increase against the approved comparison limit for that year; no limit is assumed.", "এ বছর ও আগের বছরের একই ধরনের সম্পদের মোট অঙ্ক তুলনা করুন। ওই বছরের অনুমোদিত সীমা থাকলে তার সঙ্গে মিলিয়ে দেখুন; নিজে কোনো সীমা ধরবেন না।"),
  "R-B2": pair("Check that declared income fell and asset totals rose within the same period, using both filed returns.", "দুই বছরের রিটার্ন দেখে একই সময়ে ঘোষিত আয় কমেছে এবং মোট সম্পদ বেড়েছে কি না মিলিয়ে দেখুন।"),
  "R-C1": pair("Calculate IT-10B line 10 separately from asset entries and line 7 from sources, expenses and liabilities. The difference is line 10 minus line 7. Do not substitute the dashboard fund-flow difference.", "আইটি-১০বি-র সম্পদ অংশ থেকে লাইন ১০ এবং আয়, ব্যয় ও দায় থেকে লাইন ৭ আলাদা করে হিসাব করুন। অমিল = লাইন ১০ − লাইন ৭। ড্যাশবোর্ডের অর্থের উৎসের পার্থক্যকে এই অমিল ধরবেন না।"),
  "R-C2": pair("Reconcile the difference for each linked year. Look for repeated differences in the same direction or a growing total over the required years; use the approved materiality rule.", "একাধিক বছরের অমিল আলাদা করে হিসাব করুন। একই ধরনের অমিল বারবার হচ্ছে কি না বা জমা হচ্ছে কি না দেখুন। অনুমোদিত গুরুত্বের সীমা ব্যবহার করুন।"),
  "R-C3": pair("Compare this year's opening net wealth with last year's closing net wealth, accounting for a filed revision where relevant.", "এ বছরের শুরুর নিট সম্পদ ও আগের বছরের শেষের নিট সম্পদ মিলিয়ে দেখুন। সংশোধিত রিটার্ন থাকলে সেটিও দেখুন।"),
  "R-C4": pair("Compare household spending with the earlier period and any approved spending rule. Check whether household circumstances changed.", "পারিবারিক ব্যয় আগের বছরের সঙ্গে এবং অনুমোদিত ব্যয়-যাচাই নিয়মের সঙ্গে তুলনা করুন। পরিবারের পরিস্থিতি বদলেছে কি না দেখুন।"),
  "R-D1": pair("Review at least three linked years and check repeated zero income or tax in the correct return fields.", "পরপর অন্তত তিন বছরের রিটার্নে আয় বা কর বারবার শূন্য দেখানো হয়েছে কি না যাচাই করুন।"),
  "R-D2": pair("Compare income, assets and expenses across at least three linked years to verify that the pattern repeats.", "অন্তত তিন বছরের আয়, সম্পদ ও ব্যয় একসঙ্গে দেখে একই ধরনের ওঠানামা আবার হচ্ছে কি না যাচাই করুন।"),
  "R-D3": pair("Match the date of a review flag with the filed revised-return date. Use only the approved time window.", "যাচাইয়ের সংকেত ওঠার তারিখ ও সংশোধিত রিটার্ন জমার তারিখ মিলিয়ে দেখুন। শুধু অনুমোদিত সময়সীমা ব্যবহার করুন।"),
  "R-E1": pair("Confirm that third-party data can be used, then match the taxpayer, employment period and reported income with the return.", "তৃতীয় পক্ষের তথ্য ব্যবহারের অনুমতি নিশ্চিত করে করদাতা, চাকরির সময় ও আয় রিটার্নের সঙ্গে মিলিয়ে দেখুন।"),
  "R-E2": pair("Confirm lawful access to the asset registry. Check the taxpayer, ownership share, record date and comparable value before marking a mismatch.", "সম্পদ নিবন্ধনের তথ্য আইনগতভাবে ব্যবহার করা যাবে কি না নিশ্চিত করুন। করদাতা, মালিকানার অংশ, তারিখ ও তুলনাযোগ্য মূল্য মিলিয়ে দেখুন।"),
  "R-E3": pair("Confirm lawful access and match the VAT period, BIN–TIN link, turnover and reported business figures. Turnover is not automatically taxable profit.", "ভ্যাটের তথ্য ব্যবহারের অনুমতি, সময়কাল, বিআইএন–টিআইএন সম্পর্ক, বিক্রি ও ব্যবসার হিসাব মিলিয়ে দেখুন। বিক্রি মানেই করযোগ্য লাভ নয়।"),
};
const reasonCopies: Record<string, Pair> = {
  "R-A1": pair("Retirement, family ownership or an earlier purchase.", "অবসর, পারিবারিক মালিকানা বা আগের কেনাকাটা।"),
  "R-A2": pair("Tax relief, exempt income or a special taxpayer category.", "কর রেয়াত, করমুক্ত আয় বা বিশেষ করদাতা শ্রেণি।"),
  "R-A3": pair("A wrong TIN, different tax rate or a different reporting period.", "ভুল টিআইএন, ভিন্ন করহার বা ভিন্ন হিসাবের সময়।"),
  "R-B1": pair("Loan, inheritance, gift or selling and buying another asset.", "ঋণ, উত্তরাধিকার, উপহার বা আগের সম্পদ বিক্রি করে নতুন সম্পদ কেনা।"),
  "R-B2": pair("Income stopped but savings, gratuity or inherited assets grew.", "আয় বন্ধ হলেও সঞ্চয়, আনুতোষিক বা উত্তরাধিকার থেকে সম্পদ বেড়েছে।"),
  "R-C1": pair("Gift, asset valuation difference, recording error or a real loss.", "উপহার, সম্পদের মূল্যায়নের পার্থক্য, হিসাবের ভুল বা প্রকৃত ক্ষতি।"),
  "R-C2": pair("Repeated valuation differences or family support over several years.", "বারবার মূল্যায়নের পার্থক্য বা কয়েক বছর ধরে পরিবারের আর্থিক সহায়তা।"),
  "R-C3": pair("A corrected earlier return or a data-transfer error.", "আগের রিটার্ন সংশোধন বা তথ্য স্থানান্তরের ভুল।"),
  "R-C4": pair("Another family member pays expenses, or living circumstances changed.", "পরিবারের অন্য সদস্য ব্যয় বহন করেন, অথবা জীবনযাপনের পরিস্থিতি বদলেছে।"),
  "R-D1": pair("Retirement, no earnings or income below the applicable tax threshold.", "অবসর, আয় না থাকা বা প্রযোজ্য করসীমার নিচে আয়।"),
  "R-D2": pair("Seasonal or project-based earnings.", "মৌসুমি বা প্রকল্পভিত্তিক আয়।"),
  "R-D3": pair("An ordinary filing error corrected after a notice.", "নোটিশের পরে সাধারণ ভুল সংশোধন।"),
  "R-E1": pair("Employer error, wrong TIN or reporting-period mismatch.", "নিয়োগকর্তার ভুল, ভুল টিআইএন বা সময়ের অমিল।"),
  "R-E2": pair("Shared ownership, old registry data or a different valuation basis.", "যৌথ মালিকানা, পুরোনো নিবন্ধন তথ্য বা মূল্য নির্ধারণের ভিন্ন পদ্ধতি।"),
  "R-E3": pair("Low profit margin, different accounting periods or group registration.", "কম মুনাফা, ভিন্ন হিসাবের সময় বা যৌথ নিবন্ধন।"),
};
const documentCopies: Record<string, Pair> = {
  "R-A1": pair("Asset purchase, source-of-funds and ownership documents.", "সম্পদ কেনা, অর্থের উৎস ও মালিকানার নথি।"),
  "R-A2": pair("Tax calculation, rebate and exemption documents.", "কর হিসাব, রেয়াত ও করমুক্ত আয়ের নথি।"),
  "R-A3": pair("Tax-deduction certificates and income-source records.", "উৎসে কর কাটার সনদ ও আয়ের উৎসের নথি।"),
  "R-B1": pair("Both returns, purchase papers and financing records.", "দুই বছরের রিটার্ন, ক্রয়ের দলিল ও অর্থের উৎসের নথি।"),
  "R-B2": pair("Income history, asset purchase and savings records.", "আয়ের ইতিহাস, সম্পদ কেনা ও সঞ্চয়ের নথি।"),
  "R-C1": pair("Filed IT-10B entries, bank statements and supporting receipts.", "দাখিল করা আইটি-১০বি, ব্যাংক বিবরণী ও প্রাপ্তির প্রমাণ।"),
  "R-C2": pair("Linked returns and the year-by-year reconciliation.", "সংশ্লিষ্ট বছরের রিটার্ন ও বছরভিত্তিক হিসাব মিল।"),
  "R-C3": pair("Last year's closing statement and any revised return.", "আগের বছরের শেষের সম্পদ বিবরণী ও সংশোধিত রিটার্ন।"),
  "R-C4": pair("Household expenses and proof of who paid them.", "পারিবারিক ব্যয় ও কে সেই ব্যয় বহন করেছেন তার প্রমাণ।"),
  "R-D1": pair("Returns and income records for the linked years.", "সংশ্লিষ্ট বছরগুলোর রিটার্ন ও আয়ের প্রমাণ।"),
  "R-D2": pair("Three-year income, asset and expense records.", "তিন বছরের আয়, সম্পদ ও ব্যয়ের নথি।"),
  "R-D3": pair("Flag notice, revised return and explanation for the change.", "যাচাইয়ের নোটিশ, সংশোধিত রিটার্ন ও সংশোধনের কারণ।"),
  "R-E1": pair("Employer record, TIN match and income or TDS certificate.", "নিয়োগকর্তার তথ্য, টিআইএন মিল ও আয় বা উৎসে করের সনদ।"),
  "R-E2": pair("Dated registry extract and ownership documents.", "তারিখসহ নিবন্ধনের তথ্য ও মালিকানার দলিল।"),
  "R-E3": pair("VAT return and records linking the business to the taxpayer.", "ভ্যাট রিটার্ন ও ব্যবসা-করদাতার সম্পর্কের নথি।"),
};
function localized(value: Pair | undefined, language: string): string | null {
  return value ? value[language.toLowerCase().startsWith("bn") ? "bn" : "en"] : null;
}
export function auditSignalCheck(id: string, language: string): string | null { return localized(recordChecks[id], language); }
export function auditSignalReason(id: string, language: string): string | null { return localized(reasonCopies[id], language); }
export function auditSignalDocuments(id: string, language: string): string | null { return localized(documentCopies[id], language); }

export const AUDIT_SIGNAL_IDS = Object.freeze(Object.keys(questions));
