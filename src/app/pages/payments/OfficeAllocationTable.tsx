import { groupOfficePaymentAllocations, officeMoney, type OfficePaymentItem } from './officeTransactionDetails';
import '../../../styles/office-allocation-table.css';

/** Shared Office drawer and receipt allocation presentation. Mirrors the
 * Taxpayer receipt's four columns, exact-TIN grouping and per-owner subtotal. */
export function OfficeAllocationTable({items,language,total,showAuthorization=false}:{
  items:readonly OfficePaymentItem[];language:string;total:string;showAuthorization?:boolean;
}) {
  const bn=language.startsWith('bn');
  const label=(en:string,bangla:string)=>bn?bangla:en;
  const title=label('Taxpayer payment allocations','করদাতাভিত্তিক পেমেন্ট বরাদ্দ');
  const groups=groupOfficePaymentAllocations(items);
  return <div className="office-shared-allocation-list office-receipt__scroll office-allocation-scroll" role="region" aria-label={title} tabIndex={0} data-testid="office-allocation-table">
    <table className="receipt-view__financial-table receipt-view__allocation-table" aria-label={title}>
      <thead><tr>
        <th scope="col">{label('Taxpayer / e-TIN','করদাতা / ই-টিআইএন')}</th>
        <th scope="col">{label('Payment service','পেমেন্ট সেবা')}</th>
        <th scope="col">{label('Assessment year','করবর্ষ')}</th>
        <th scope="col" className="office-receipt__numeric">{label('Allocated amount (৳)','বরাদ্দের পরিমাণ')}</th>
      </tr></thead>
      <tbody>{groups.flatMap(group=>group.items.map((item,index)=><tr key={group.key+':'+index} data-testid="office-taxpayer-head-row">
        {index===0&&<td rowSpan={group.items.length} data-testid="office-taxpayer-cell">
          <strong>{group.taxpayer}</strong>
          {group.taxpayerTin&&!group.taxpayer.includes(group.taxpayerTin)&&<small>{group.taxpayerTin}</small>}
          {group.items.length>1&&<small className="office-allocation-subtotal">{label('Taxpayer subtotal','করদাতার মোট')}: {officeMoney(group.totalMinor,language)}</small>}
        </td>}
        <td className="office-allocation-service">{item.service}
          {item.economicCode&&<small>{label('Economic code','অর্থনৈতিক কোড')}: {item.economicCode}</small>}
          {showAuthorization&&item.authorization&&<small>{label('Authorization','অনুমোদন')}: {item.authorization}</small>}
        </td>
        <td className="office-allocation-year">{item.assessmentYear}</td>
        <td className="office-receipt__numeric office-allocation-amount">{officeMoney(item.amountMinor,language)}</td>
      </tr>))}</tbody>
      <tfoot><tr><td colSpan={3} className="office-receipt__numeric">{label('Grand total','সর্বমোট')}</td>
        <td className="office-receipt__numeric">{total}</td></tr></tfoot>
    </table>
  </div>;
}
