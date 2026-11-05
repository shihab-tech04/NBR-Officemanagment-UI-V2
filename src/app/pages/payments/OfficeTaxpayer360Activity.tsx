import type {TaxpayerActivitySnapshot} from './officeTaxpayerActivity';
import {officeMoney} from './officeTransactionDetails';
import type {TableRow} from '../modulePageUtils';

export function OfficeTaxpayer360Activity({snapshot,language,formatCount,formatDate,onOpen}:{
  snapshot:TaxpayerActivitySnapshot;
  language:'en'|'bn';
  formatCount:(number:number)=>string;
  formatDate:(date:string)=>string;
  onOpen:(row:TableRow)=>void;
}){
  const bn=language==='bn';
  const tr=(en:string,be:string)=>bn?be:en;
  const groups=[
    {label:tr('Self-payment selections','নিজের পেমেন্ট হিসেবে নির্বাচিত'),count:snapshot.payerContext.self},
    {label:tr('Payment for someone else','অন্যের জন্য পেমেন্ট হিসেবে নির্বাচিত'),count:snapshot.payerContext.other},
    {label:tr('Not specified','উল্লেখ করা হয়নি'),count:snapshot.payerContext.unspecified}
  ];
  return <section className="payment-dashboard" data-testid="taxpayer-360-activity"
    aria-label={tr('Taxpayer payment activity summary','করদাতার পেমেন্ট কার্যক্রমের সারসংক্ষেপ')}>
    <header className="payment-dashboard__title">
      <h2>{tr('Recorded payment activity','নথিভুক্ত পেমেন্ট কার্যক্রম')}</h2>
      <p>{tr('Amounts are linked to this taxpayer only. Recorded activity is not proof of tax credit or Treasury receipt.',
        'অর্থের পরিমাণ শুধু এই করদাতার সঙ্গে সংযুক্ত। নথিভুক্ত কার্যক্রম কর ক্রেডিট বা ট্রেজারি রসিদের প্রমাণ নয়।')}</p>
    </header>
    <div className="payment-dashboard__grid">
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head"><h3>{tr('Service history','সেবাভিত্তিক ইতিহাস')}</h3><span>{formatCount(snapshot.services.length)}</span></div>
        {snapshot.services.length? <div className="payment-dashboard__bars">
          {snapshot.services.slice(0,7).map(service=><div className="payment-dashboard__bar" key={service.label}>
            <div className="payment-dashboard__bar-top"><span>{service.label}</span><strong>{formatCount(service.count)}</strong></div>
            <progress max={Math.max(1,snapshot.linkedRecords)} value={service.count} aria-label={service.label}/>
          </div>)}
        </div>:<p className="table-page__desc">{tr('No linked payment records.','কোনো সংযুক্ত পেমেন্ট রেকর্ড নেই।')}</p>}
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head"><h3>{tr('Payment context','পেমেন্টের ধরন')}</h3><span>{formatCount(snapshot.linkedRecords)} {tr('records','রেকর্ড')}</span></div>
        <div className="payment-dashboard__quality">
          {groups.map(group=><div key={group.label}><span>{group.label}</span><strong>{formatCount(group.count)}</strong></div>)}
        </div>
        <p className="payment-dashboard__hint">{tr('Self/other reflects the payer’s recorded selection, not verified authorization or identity.',
          'নিজের/অন্যের জন্য নির্বাচনটি নথিভুক্ত তথ্য; এটি পরিচয় বা অনুমোদন যাচাইয়ের প্রমাণ নয়।')}</p>
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head"><h3>{tr('Assessment-year history','করবর্ষভিত্তিক ইতিহাস')}</h3><span>{formatCount(snapshot.assessmentYears.length)} {tr('years','বর্ষ')}</span></div>
        <div className="payment-dashboard__quality">
          {snapshot.assessmentYears.map(item=><div key={item.label}><span>{item.label}</span><strong>{formatCount(item.count)}</strong></div>)}
        </div>
        {snapshot.assessmentYears.length===0&&<p className="table-page__desc">{tr('No linked assessment years.','কোনো সংযুক্ত করবর্ষ নেই।')}</p>}
      </section>
      <section className="card payment-dashboard__panel">
        <div className="payment-dashboard__section-head"><h3>{tr('Latest linked payments','সর্বশেষ সংযুক্ত পেমেন্ট')}</h3></div>
        <div className="payment-dashboard__recent">
          {snapshot.rows.slice(0,4).map(({payment,row})=><button key={payment.id} type="button"
            className="payment-dashboard__recent-item" onClick={()=>onOpen(row)}>
            <span className="payment-dashboard__recent-main">
              <strong>{row.payment_type}</strong>
              <small>{formatDate(payment.createdAt)} · {row.assessment_year}</small>
            </span>
            <span className="payment-dashboard__recent-side">
              <strong>{row.amount}</strong><small>{row.financial_receipt_status}</small>
            </span>
          </button>)}
        </div>
        {!snapshot.rows.length&&<p className="table-page__desc">{tr('No payment activity for the selected period.','নির্বাচিত সময়ে কোনো পেমেন্ট কার্যক্রম নেই।')}</p>}
      </section>
    </div>
  </section>;
}

export function OfficeTaxpayer360Notices({snapshot,language,formatDate,onOpen}:{
  snapshot:TaxpayerActivitySnapshot;
  language:'en'|'bn';formatDate:(date:string)=>string;onOpen:(row:TableRow)=>void;
}){
  const tr=(en:string,be:string)=>language==='bn'?be:en;
  const records=new Map(snapshot.rows.map(entry=>[entry.payment.id,entry.row]));
  return <section className="card payment-module__card" data-testid="taxpayer-360-notices">
    <h2>{tr('Linked payment notices','সংযুক্ত পেমেন্ট বিজ্ঞপ্তি')}</h2>
    <p className="table-page__desc">{tr('Notices recorded against this taxpayer’s linked payments only.',
      'শুধু এই করদাতার সংযুক্ত পেমেন্টের নথিভুক্ত বিজ্ঞপ্তি দেখানো হচ্ছে।')}</p>
    {snapshot.notices.length===0?<p className="table-page__desc" role="status">{tr('No linked payment notices.','সংযুক্ত কোনো পেমেন্ট বিজ্ঞপ্তি নেই।')}</p>:
      <div className="payment-dashboard__recent">
        {snapshot.notices.slice(0,50).map(n=><button type="button" key={n.id} className="payment-dashboard__recent-item"
          onClick={()=>{const row=records.get(n.paymentId);if(row)onOpen(row);}} disabled={!records.has(n.paymentId)}>
          <span className="payment-dashboard__recent-main"><strong>{n.type}</strong>
            <small>{formatDate(n.createdAt)}</small></span>
          <span className="payment-dashboard__recent-side"><small>{n.paymentId}</small></span>
        </button>)}
        {snapshot.notices.length>50&&<p className="payment-dashboard__hint">
          {tr('Showing latest 50 of ','সর্বশেষ ৫০টি দেখানো হচ্ছে, মোট ')}{snapshot.notices.length}
        </p>}
      </div>}
  </section>;
}
