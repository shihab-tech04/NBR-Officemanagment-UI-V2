import {useMemo} from 'react';
import type {TableRow} from '../modulePageUtils';

export type OfficeJourneyEntry={record:TableRow;occurredAt:string};

export function OfficeTaxJourney({entries,language,onOpen}:{
  entries:readonly OfficeJourneyEntry[];
  language:'en'|'bn';
  onOpen:(row:TableRow)=>void;
}){
  const bn=language==='bn';
  const tr=(en:string,bengali:string)=>bn?bengali:en;
  // Preserve a one-to-one identity with the SQL-mirrored payment table.
  // Never synthesize a Treasury event, tax liability or credit from a saved payment.
  const grouped=useMemo(()=>{
    const rows=[...entries].sort((a,b)=>{
      const left=Date.parse(a.occurredAt),right=Date.parse(b.occurredAt);
      return (Number.isFinite(right)?right:-Infinity)-(Number.isFinite(left)?left:-Infinity)
        ||String(a.record.payment_ref??a.record.key??'').localeCompare(String(b.record.payment_ref??b.record.key??''));
    });
    const groups=new Map<string,OfficeJourneyEntry[]>();
    for(const entry of rows){
      const time=Date.parse(entry.occurredAt);
      const year=Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{year:'numeric',timeZone:'Asia/Dhaka'}).format(new Date(time)):tr('Date unavailable','তারিখ পাওয়া যায়নি');
      groups.set(year,[...(groups.get(year)??[]),entry]);
    }
    return [...groups.entries()];
  },[entries,language]);
  const formatDate=(value:string)=>{
    const date=new Date(value);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',
      {day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dhaka'}).format(date):tr('Date unavailable','তারিখ পাওয়া যায়নি');
  };
  return <section className="card payment-module__card" data-testid="office-tax-journey">
    <header className="mb-4">
      <h2 className="text-lg font-semibold">{tr('Tax journey','কর যাত্রা')}</h2>
      <p className="table-page__desc">{tr('Recorded payments in date order. Select an event to view all payment and allocation details.',
        'তারিখ অনুযায়ী নথিভুক্ত পেমেন্ট। সম্পূর্ণ বিবরণ ও বরাদ্দ দেখতে ঘটনা নির্বাচন করুন।')}</p>
      <p className="table-page__desc">{tr('Financial settlement and tax credits are not verified by this payment record.',
        'এই পেমেন্ট রেকর্ড দিয়ে আর্থিক নিষ্পত্তি বা কর ক্রেডিট যাচাই করা যায় না।')}</p>
    </header>
    {entries.length===0?<p role="status" className="table-page__desc">{tr('No payment records for this taxpayer and assessment year.',
      'এই করদাতা ও করবর্ষের কোনো পেমেন্ট রেকর্ড নেই।')}</p>:<div className="space-y-6">
      {grouped.map(([year,items])=><section key={year} aria-label={year}>
        <h3 className="mb-3 text-xl font-semibold">{year}</h3>
        <ol className="space-y-0" aria-label={tr('Payment events','পেমেন্টের ঘটনা')}>
          {items.map(({record,occurredAt})=><li key={String(record.payment_ref??record.key)} className="grid grid-cols-[95px_minmax(0,1fr)] gap-3 sm:grid-cols-[145px_minmax(0,1fr)]">
            <time dateTime={occurredAt} className="pt-1 text-right text-xs text-slate-500">{formatDate(occurredAt)}</time>
            <div className="relative border-l-2 border-slate-200 pb-5 pl-5 last:pb-0">
              <span aria-hidden="true" className="absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-700"/>
              <button type="button" className="min-h-11 w-full rounded-lg p-1 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={()=>onOpen(record)} aria-label={tr('View payment details ','পেমেন্টের বিস্তারিত দেখুন ')+String(record.payment_ref??record.key)}>
                <span className="block text-sm font-semibold break-words">{String(record.payment_type??tr('Payment','পেমেন্ট'))} · {String(record.amount??'—')}</span>
                <span className="mt-1 block text-xs text-slate-600 break-words">
                  {tr('AY ','করবর্ষ ')}{String(record.assessment_year??'—')} · {String(record.financial_receipt_status??'—')}
                </span>
                <span className="mt-1 block text-xs text-slate-500 break-all">
                  {String(record.payment_ref??record.key??'—')} · {tr('Tax credit not verified','কর ক্রেডিট যাচাই হয়নি')}
                </span>
              </button>
            </div>
          </li>)}
        </ol>
      </section>)}
    </div>}
  </section>;
}
