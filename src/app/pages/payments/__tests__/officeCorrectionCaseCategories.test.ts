import {describe,expect,it} from 'vitest';
import {partitionOfficeCorrectionCases} from '../officeCorrectionCaseCategories';
import type {OfficeCorrectionInquiry} from '../correctionReviewApi';

const base:OfficeCorrectionInquiry={
  requestId:'c1',sourceEventId:'e1',sourceEventType:'CORRECTION_SUBMITTED',
  sourcePaymentId:'p1',sourcePaymentKind:'TAXPAY_STORY_PAYMENT',
  originalReference:'PARENT-123456',reason:'Wrong allocation',requestedOutcome:'Review requested',
  evidenceState:'PENDING_EVIDENCE',changeKind:null,oldValue:null,newValue:null,
  createdAt:'2026-11-15T11:00:00Z',reviewState:'PENDING',reviewRevision:1,
  reviewUpdatedAt:'2026-11-15T11:00:00Z',
  decisionHistory:[],pendingDelivery:false,deliveryState:null,
  lastDeliveryError:null,availableActions:[],
};
describe('separate authorized Office recipient reports',()=>{
  it('separates allegations from correction review without dropping either',()=>{
    const report={...base,requestId:'r1',caseKind:'UNSOLICITED_PAYMENT_REPORT' as const};
    const correction={...base,caseKind:'CORRECTION_REVIEW' as const};
    const legacy={...base,requestId:'legacy',caseKind:undefined};
    const grouped=partitionOfficeCorrectionCases([report,correction,legacy]);
    expect(grouped.reports.map(x=>x.requestId)).toEqual(['r1']);
    expect(grouped.corrections.map(x=>x.requestId)).toEqual(['c1','legacy']);
    expect(grouped.corrections.length+grouped.reports.length).toBe(3);
  });
  it('preserves server-issued report status, action scope and audit history',()=>{
    const report={...base,requestId:'r2',caseKind:'UNSOLICITED_PAYMENT_REPORT' as const,
      reviewState:'REVIEWER_VERIFIED',reviewRevision:3,
      availableActions:['APPROVER_CLOSE' as const]};
    const grouped=partitionOfficeCorrectionCases([report]);
    expect(grouped.reports[0]).toBe(report);
    expect(grouped.reports[0].reviewRevision).toBe(3);
    expect(grouped.reports[0].availableActions).toEqual(['APPROVER_CLOSE']);
    expect(grouped.corrections).toEqual([]);
  });
  it('does not invent a report when the authorized queue is empty',()=>{
    expect(partitionOfficeCorrectionCases([])).toEqual({corrections:[],reports:[]});
  });
});
