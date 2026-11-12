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
  it('groups the event in the same Dhaka calendar year shown in its displayed date',()=>{
    const html=renderToStaticMarkup(<OfficeTaxJourney language="en" onOpen={()=>{}}
      entries={[{record:newerRow,occurredAt:'2026-12-31T18:30:00Z'}]}/>);
    expect(html).toContain('aria-label="2027"');
    expect(html).not.toContain('aria-label="2026"');
    expect(html).toContain('1 Jan 2027');
  });
  it('does not invent an event when no taxpayer payment matches',()=>{
    const html=renderToStaticMarkup(<OfficeTaxJourney entries={[]} language="bn" onOpen={()=>{}}/>);
    expect(html).toContain('কোনো পেমেন্ট রেকর্ড নেই');
    expect(html).not.toContain('<li ');
  });
});
