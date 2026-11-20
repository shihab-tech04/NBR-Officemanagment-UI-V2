import type {StoryPayment} from './story1OfficeApi';
import {toStoryPaymentRow} from './story1PaymentPresentation';
import {officeMoney} from './officeTransactionDetails';
import {buildOfficePaymentDashboard} from './officePaymentDashboard';
import {officePaymentAnalytics} from './officePaymentAnalytics';
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
  loading?:boolean;
  error?:string;
  onRetry?:()=>void;
};

/** Audit-grade overview of source-backed payment activity.
 * No private beneficiary address books, invented Treasury totals or asserted credit awards.
 */
export function OfficePaymentDashboardInsights({
  payments,year,language,formatCount,formatDate,
  onOpenPayment,onViewTransactions,onSelectYear,
  loading=false,error='',onRetry
}:Props){
  const bn=language==='bn';
  const label=(en:string,be:string)=>bn?be:en;
  const sourceAvailable=!loading&&!error;
  const readCount=(value:number)=>sourceAvailable?formatCount(value):'—';
  const report=buildOfficePaymentDashboard(payments,year);
  const methods=officePaymentAnalytics(payments,year).methods.map(([name,count])=>({label:name,count}));
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
  const breakdown=(items:readonly {label:string;count:number}[],kind:'service'|'year'|'method')=>
    !sourceAvailable?<p className="table-page__desc">{label('Payment data unavailable. Sign in with an authorized Office payment account and retry.','পেমেন্টের তথ্য অনুপলব্ধ। অনুমোদিত অফিস পেমেন্ট অ্যাকাউন্টে সাইন ইন করে আবার চেষ্টা করুন।')}</p>:
    items.length===0?<p className="table-page__desc">{label('No matching payment records.','মিলে যায় এমন পেমেন্ট রেকর্ড নেই।')}</p>:
    <div className="payment-dashboard__bars">
      {items.slice(0,7).map(item=><div className="payment-dashboard__bar" key={kind+':'+item.label}>
        <div className="payment-dashboard__bar-top">
          {kind==='year'?<button type="button" onClick={()=>onSelectYear(item.label)}
            className="payment-dashboard__year-link" aria-label={label('Filter to assessment year ','করবর্ষ অনুযায়ী দেখুন ')+item.label}>
            {item.label}</button>:<span>{item.label}</span>}
          <strong>{readCount(item.count)}</strong>
        </div>
        <progress value={item.count} max={Math.max(1,report.total)}
          aria-label={item.label+' — '+readCount(item.count)}/>
      </div>)}
      {kind==='year'&&report.years.length>1&&<p className="payment-dashboard__hint">
        {label('One multi-year payment can appear in more than one year.','একটি একাধিক করবর্ষের পেমেন্ট একাধিক বর্ষে দেখানো হতে পারে।')}
      </p>}
    </div>;
  return <section className="payment-dashboard" aria-label={label('Payment operations','পেমেন্ট কার্যক্রম')} aria-busy={loading} data-source-state={loading?'loading':error?'unavailable':'available'}>
    <header className="payment-dashboard__title">
      <div><h2>{label('Payment operations','পেমেন্ট কার্যক্রম')}</h2>
        <p>{label('Recorded taxpayer payment activity; not verified Treasury collections or tax credits.',
          'করদাতাদের নথিভুক্ত পেমেন্ট কার্যক্রম; ট্রেজারি আদায় বা কর ক্রেডিট যাচাইয়ের প্রমাণ নয়।')}</p>
      </div>
    </header>
    {!sourceAvailable&&<div className="card payment-dashboard__source-unavailable" role={error?'alert':'status'}>
      <div>
        <strong>{loading?label('Loading Office payment records','অফিস পেমেন্ট রেকর্ড লোড হচ্ছে'):label('Payment data is temporarily unavailable','পেমেন্ট তথ্য সাময়িকভাবে অনুপলব্ধ')}</strong>
        <p>{loading?label('Checking the authorized Office payment feed.','অনুমোদিত অফিস পেমেন্ট উৎস যাচাই করা হচ্ছে।'):
          label('The existing Office payment authorization or SQL source is not ready. No payment totals, exceptions or reconciliation results are being assumed.','বিদ্যমান অফিস পেমেন্ট অনুমতি অথবা SQL উৎস প্রস্তুত নেই। কোনো পেমেন্ট মোট, ব্যতিক্রম বা সমন্বয়ের ফল অনুমান করা হচ্ছে না।')}</p>
      </div>
      {!loading&&onRetry&&<button type="button" onClick={onRetry} className="table-card__toolbar-btn" aria-label={label('Retry Office payments','অফিস পেমেন্ট আবার লোড করুন')}>{label('Retry','আবার চেষ্টা করুন')}</button>}
    </div>}
    <div className="payment-dashboard__status-grid" aria-label={label('Recorded payment states','পেমেন্ট রেকর্ডের অবস্থা')}>
      {categories.map(item=><div className="card payment-dashboard__status" key={item.key}>
        <span>{item.name}</span><strong>{readCount(item.value)}</strong>
        <small>{item.help}</small>
      </div>)}
    </div>
    <div className="payment-dashboard__grid">
      <section className="card payment-dashboard__panel" aria-label={label('Operational review','কার্যক্রম পর্যালোচনা')}>
        <div className="payment-dashboard__section-head">
          <h3>{label('Operational review','কার্যক্রম পর্যালোচনা')}</h3>
          <button className="payment-dashboard__year-link" type="button" onClick={onViewTransactions}>{label('View transactions','লেনদেন দেখুন')}</button>
        </div>
        <p className="payment-dashboard__hint">{label(
          'Recorded payment states and missing fields that may need checking. Counts can overlap.',
          'নথিভুক্ত পেমেন্টের অবস্থা ও যাচাইযোগ্য অনুপস্থিত তথ্য। একই রেকর্ড একাধিক ক্ষেত্রে গণনা হতে পারে।'
        )}</p>
        <div className="payment-dashboard__quality">
          <div><span>{label('Failed payment records','ব্যর্থ পেমেন্ট রেকর্ড')}</span><strong>{readCount(report.failed)}</strong></div>
          <div><span>{label('Pending payment records','প্রক্রিয়াধীন পেমেন্ট রেকর্ড')}</span><strong>{readCount(report.pending)}</strong></div>
          <div><span>{label('Records without linked taxpayer TIN','সংযুক্ত করদাতার টিআইএনবিহীন রেকর্ড')}</span><strong>{readCount(report.noTaxpayerTin)}</strong></div>
          <div><span>{label('Records without payment method','পেমেন্ট পদ্ধতিবিহীন রেকর্ড')}</span><strong>{readCount(report.noPaymentMethod)}</strong></div>
        </div>
        <p className="payment-dashboard__hint">{label(
          'These are record indicators, not confirmed financial or compliance incidents.',
          'এগুলো রেকর্ডভিত্তিক নির্দেশক; নিশ্চিত আর্থিক বা বিধি লঙ্ঘনের ঘটনা নয়।'
        )}</p>
      </section>
      <section className="card payment-dashboard__panel" aria-label={label('Source and reconciliation evidence','উৎস ও সমন্বয় যাচাই')}>
        <div className="payment-dashboard__section-head">
          <h3>{label('Source and reconciliation evidence','উৎস ও সমন্বয় যাচাই')}</h3>
          <span>{label('Evidence status','প্রমাণের অবস্থা')}</span>
        </div>
        <p className="payment-dashboard__hint">{label(
          'The current Overview reads recorded Office payment data. The following independent checks cannot be inferred from this feed.',
          'বর্তমান ওভারভিউ অফিসে নথিভুক্ত পেমেন্টের তথ্য পড়ে। এই উৎস থেকে নিচের স্বাধীন যাচাইগুলোর ফল জানা যায় না।'
        )}</p>
        <div className="payment-dashboard__quality">
          <div><span>{label('Office recorded-payment feed','অফিসের নথিভুক্ত পেমেন্ট উৎস')}</span><strong>{loading?label('Loading','লোড হচ্ছে'):error?label('Unavailable','অনুপলব্ধ'):label('Read successful','তথ্য পড়া সফল')}</strong></div>
          <div><span>{label('Taxpayer–Office item-level parity','করদাতা–অফিস রেকর্ডের মিল')}</span><strong>{label('Not verified here','এখানে যাচাই হয়নি')}</strong></div>
          <div><span>{label('Treasury settlement and tax credit','ট্রেজারি নিষ্পত্তি ও কর ক্রেডিট')}</span><strong>{label('Evidence unavailable','প্রমাণ অনুপলব্ধ')}</strong></div>
          <div><span>{label('External-source ledger coverage','বাহ্যিক উৎসের লেজার কভারেজ')}</span><strong>{label('Not verified here','এখানে যাচাই হয়নি')}</strong></div>
        </div>
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head">
          <h3>{label('Payments by service','সেবা অনুযায়ী পেমেন্ট')}</h3>
          <span>{readCount(report.services.length)} {label('services','সেবা')}</span>
        </div>
        {breakdown(report.services,'service')}
        <div className="payment-dashboard__section-head payment-dashboard__subsection">
          <h3>{label('Recorded payment methods','নথিভুক্ত পেমেন্ট পদ্ধতি')}</h3>
          <span>{readCount(methods.length)} {label('methods','পদ্ধতি')}</span>
        </div>
        {breakdown(methods,'method')}
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
        {!sourceAvailable?<p className="table-page__desc">{label('Recent activity is unavailable while the Office payment feed cannot be read.','অফিস পেমেন্ট উৎস পড়া না গেলে সাম্প্রতিক কার্যক্রম পাওয়া যাবে না।')}</p>:report.recent.length===0?<p className="table-page__desc">{label('No recorded activity for this period.','এই সময়ে কোনো নথিভুক্ত কার্যক্রম নেই।')}</p>:
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
          {data.map(item=><div key={item.key}><span>{item.name}</span><strong>{readCount(item.number)}</strong></div>)}
        </div>
        <p className="payment-dashboard__hint">{label('Treasury settlement and statutory tax-credit verification are not available in this source.',
          'এই উৎস থেকে ট্রেজারি নিষ্পত্তি ও আইনগত কর ক্রেডিট যাচাই করা যাচ্ছে না।')}</p>
      </section>
    </div>
  </section>;
}
