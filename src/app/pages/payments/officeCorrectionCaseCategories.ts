import type {OfficeCorrectionInquiry} from './correctionReviewApi';

/** Split the same already-authorized Office queue without widening permissions.
 * Unsolicited payment reports must remain separately trackable from ordinary
 * correction requests, including after officer review and page refresh.
 */
export function partitionOfficeCorrectionCases(items:readonly OfficeCorrectionInquiry[]):{
  corrections:OfficeCorrectionInquiry[];
  reports:OfficeCorrectionInquiry[];
}{
  const corrections:OfficeCorrectionInquiry[]=[];
  const reports:OfficeCorrectionInquiry[]=[];
  for(const item of items){
    if(item.caseKind==='UNSOLICITED_PAYMENT_REPORT')reports.push(item);
    else corrections.push(item); // legacy cases have no category and are corrections
  }
  return {corrections,reports};
}
