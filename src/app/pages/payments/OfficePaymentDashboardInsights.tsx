import type {StoryPayment} from './story1OfficeApi';
import {toStoryPaymentRow} from './story1PaymentPresentation';
import {officeMoney} from './officeTransactionDetails';
import {buildOfficePaymentDashboard} from './officePaymentDashboard';
import type {TableRow} from '../modulePageUtils';

type Props={
  payments:readonly StoryPayment[];
  year:string;
  language:'en'|'bn';
  formatCount:(value:number)=>string;
  formatDate:(iso:string)=>string;
  onOpenPayment:(row:TableRow)=>void;
  onViewTransactions:()=>void;
  onSelectYear:(year:string)=>void;
};

/** Audit-grade overview of source-backed payment activity.
 * No private beneficiary address books, invented Treasury totals or asserted credit awards.
 */
export function OfficePaymentDashboardInsights({
  payments,year,language,formatCount,formatDate,
  onOpenPayment,onViewTransactions,onSelectYear
}:Props){
  const bn=language==='bn';
  const label=(en:string,be:string)=>bn?be:en;
  const report=buildOfficePaymentDashboard(payments,year);
  const categories=[
    {key:'saved',name:label('Saved records','সংরক্ষিত রেকর্ড'),value:report.saved,
      help:label('Recorded, not bank-settled','নথিভুক্ত, ব্যাংকে নিষ্পত্তির প্রমাণ নয়')},
    {key:'pending',name:label('Pending records','প্রক্রিয়াধীন রেকর্ড'),value:report.pending,
      help:label('Awaiting a recorded result','নথিভুক্ত ফলাফলের অপেক্ষায়')},
    {key:'failed',name:label('Failed records','ব্যর্থ রেকর্ড'),value:report.failed,
      help:label('Requires transaction review','লেনদেনের বিবরণ পর্যালোচনা প্রয়োজন')},
    {key:'other',name:label('Other record states','অন্যান্য রেকর্ডের অবস্থা'),value:report.other,
      help:label('Not classified as settled','নিষ্পত্তিকৃত হিসেবে চিহ্নিত নয়')},
  ] as const;
  const data=[{
    key:'tin',number:report.noTaxpayerTin,
    name:label('Without linked taxpayer TIN','সংযুক্ত করদাতার টিআইএন নেই')
  },{
    key:'ref',number:report.noExternalReceiptReference,
    name:label('Without external receipt reference','বাহ্যিক রসিদের রেফারেন্স নেই')
  },{
    key:'method',number:report.noPaymentMethod,
    name:label('Without recorded payment method','নথিভুক্ত পেমেন্ট পদ্ধতি নেই')
  }];
  const breakdown=(items:readonly {label:string;count:number}[],kind:'service'|'year')=>
    items.length===0?<p className="table-page__desc">{label('No matching payment records.','মিলে যায় এমন পেমেন্ট রেকর্ড নেই।')}</p>:
    <div className="payment-dashboard__bars">
      {items.slice(0,7).map(item=><div className="payment-dashboard__bar" key={kind+':'+item.label}>
        <div className="payment-dashboard__bar-top">
          {kind==='year'?<button type="button" onClick={()=>onSelectYear(item.label)}
            className="payment-dashboard__year-link" aria-label={label('Filter to assessment year ','করবর্ষ অনুযায়ী দেখুন ')+item.label}>
            {item.label}</button>:<span>{item.label}</span>}
          <strong>{formatCount(item.count)}</strong>
        </div>
        <progress value={item.count} max={Math.max(1,report.total)}
          aria-label={item.label+' — '+formatCount(item.count)}/>
      </div>)}
      {kind==='year'&&report.years.length>1&&<p className="payment-dashboard__hint">
        {label('One multi-year payment can appear in more than one year.','একটি একাধিক করবর্ষের পেমেন্ট একাধিক বর্ষে দেখানো হতে পারে।')}
      </p>}
    </div>;
  return <section className="payment-dashboard" aria-label={label('Payment operations','পেমেন্ট কার্যক্রম')}>
    <header className="payment-dashboard__title">
      <div><h2>{label('Payment operations','পেমেন্ট কার্যক্রম')}</h2>
        <p>{label('Recorded taxpayer payment activity; not verified Treasury collections or tax credits.',
          'করদাতাদের নথিভুক্ত পেমেন্ট কার্যক্রম; ট্রেজারি আদায় বা কর ক্রেডিট যাচাইয়ের প্রমাণ নয়।')}</p>
      </div>
    </header>
    <div className="payment-dashboard__status-grid" aria-label={label('Recorded payment states','পেমেন্ট রেকর্ডের অবস্থা')}>
      {categories.map(item=><div className="card payment-dashboard__status" key={item.key}>
        <span>{item.name}</span><strong>{formatCount(item.value)}</strong>
        <small>{item.help}</small>
      </div>)}
    </div>
    <div className="payment-dashboard__grid">
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head">
          <h3>{label('Payments by service','সেবা অনুযায়ী পেমেন্ট')}</h3>
          <span>{formatCount(report.services.length)} {label('services','সেবা')}</span>
        </div>
        {breakdown(report.services,'service')}
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head">
          <h3>{label('Assessment-year coverage','করবর্ষভিত্তিক চিত্র')}</h3>
          {year!=='all'&&<button className="payment-dashboard__year-link" type="button" onClick={()=>onSelectYear('all')}>{label('All years','সব করবর্ষ')}</button>}
        </div>
        {breakdown(report.years,'year')}
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head">
          <h3>{label('Recent payment activity','সাম্প্রতিক পেমেন্ট কার্যক্রম')}</h3>
          <button className="payment-dashboard__year-link" type="button" onClick={onViewTransactions}>{label('View all','সব দেখুন')}</button>
        </div>
        {report.recent.length===0?<p className="table-page__desc">{label('No recorded activity for this period.','এই সময়ে কোনো নথিভুক্ত কার্যক্রম নেই।')}</p>:
          <div className="payment-dashboard__recent">
            {report.recent.map(p=>{
              const row=toStoryPaymentRow(p);
              const when=Date.parse(p.createdAt);
              return <button type="button" key={p.id} className="payment-dashboard__recent-item"
                onClick={()=>onOpenPayment(row)}>
                <span className="payment-dashboard__recent-main">
                  <strong>{row.taxpayer_name==='—'?label('Taxpayer not linked','করদাতার তথ্য নেই'):row.taxpayer_name}</strong>
                  <small>{Number.isFinite(when)?formatDate(p.createdAt):label('Date unavailable','তারিখ নেই')}
                    {' · '}{row.payment_type}</small>
                </span>
                <span className="payment-dashboard__recent-side">
                  <strong>{officeMoney(p.amountMinor,language)}</strong>
                  <small>{row.financial_receipt_status}</small>
                </span>
              </button>;
            })}
          </div>}
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head">
          <h3>{label('Record completeness','রেকর্ডে তথ্যের পূর্ণতা')}</h3>
          <span>{label('Data checks','তথ্য যাচাই')}</span>
        </div>
        <p className="payment-dashboard__hint">{label('These counts flag missing fields in the recorded data; they are not compliance findings.',
          'এগুলো নথিভুক্ত তথ্যে অনুপস্থিত ঘর নির্দেশ করে; কোনো আইনগত সিদ্ধান্ত নয়।')}</p>
        <div className="payment-dashboard__quality">
          {data.map(item=><div key={item.key}><span>{item.name}</span><strong>{formatCount(item.number)}</strong></div>)}
        </div>
        <p className="payment-dashboard__hint">{label('Treasury settlement and statutory tax-credit verification are not available in this source.',
          'এই উৎস থেকে ট্রেজারি নিষ্পত্তি ও আইনগত কর ক্রেডিট যাচাই করা যাচ্ছে না।')}</p>
      </section>
    </div>
  </section>;
}
