import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {OfficeTaxJourney} from '../OfficeTaxJourney';
import type {TableRow} from '../../modulePageUtils';

const oldRow={key:'old',payment_ref:'old-sql-id',payment_type:'Tax with Return',amount:'৳80.00',
  assessment_year:'2025-26',financial_receipt_status:'Payment record saved'} as TableRow;
const newerRow={key:'new',payment_ref:'new-sql-id',payment_type:'Advance Tax',amount:'৳15.00',
  assessment_year:'2026-27',financial_receipt_status:'PENDING'} as TableRow;

describe('Office taxpayer Tax Journey',()=>{
  it('shows one timeline event per SQL-scoped record, across calendar years, newest first',()=>{
    const html=renderToStaticMarkup(<OfficeTaxJourney language="en" onOpen={()=>{}}
      entries={[{record:oldRow,occurredAt:'2025-09-09T10:00:00Z'},
        {record:newerRow,occurredAt:'2026-11-02T06:00:00Z'}]}/>);
    expect((html.match(/<li /g)||[]).length).toBe(2);
    expect(html).toContain('2026');
    expect(html).toContain('2025');
    expect(html.indexOf('new-sql-id')).toBeLessThan(html.indexOf('old-sql-id'));
    expect(html).toContain('Tax credit not verified');
    expect(html).not.toContain('Treasury settled');
  });
  it('shows correction request and acknowledged decision events as separate dated records',()=>{
    const correctionRow={key:'office-correction:request-1',__correctionInquiryId:'request-1',
      reason:'Wrong assessment year',original_reference:'SYN-REF-003',status:'REVIEWER_VERIFIED'} as TableRow;
    const html=renderToStaticMarkup(<OfficeTaxJourney language="en" onOpen={()=>{}}
      entries={[
        {record:correctionRow,occurredAt:'2026-11-01T10:00:00Z',eventKind:'CORRECTION_REQUEST',
          eventId:'request-event-1',eventTitle:'Correction request recorded',eventSummary:'Wrong assessment year'},
        {record:correctionRow,occurredAt:'2026-11-03T10:00:00Z',eventKind:'CORRECTION_DECISION',
          eventId:'decision-event-1',eventTitle:'Correction decision delivered',
          eventSummary:'REVIEWER_VERIFY · Acknowledged by TaxPay'},
      ]}/>);
    expect((html.match(/<li /g)||[]).length).toBe(2);
    expect(html).toContain('Correction request recorded');
    expect(html).toContain('Correction decision delivered');
    expect(html.indexOf('decision-event-1')).toBeLessThan(html.indexOf('request-event-1'));
    expect(html).toContain('Acknowledged by TaxPay');
    expect(html).not.toContain('Tax credit not verified');
  });

  it('does not invent an event when no taxpayer payment matches',()=>{
    const html=renderToStaticMarkup(<OfficeTaxJourney entries={[]} language="bn" onOpen={()=>{}}/>);
    expect(html).toContain('কোনো পেমেন্ট রেকর্ড নেই');
    expect(html).not.toContain('<li ');
  });

  it('groups events by the Bangladesh calendar year used for displayed dates',()=>{
    const html=renderToStaticMarkup(<OfficeTaxJourney language="en" onOpen={()=>{}}
      entries={[{record:{...oldRow,key:'year-boundary',payment_ref:'year-boundary'},occurredAt:'2026-12-31T20:00:00Z'}]}/>);
    expect(html).toContain('<section aria-label="2027">');
    expect(html).toContain('1 Jan 2027');
    expect(html).not.toContain('<section aria-label="2026">');
  });
});
