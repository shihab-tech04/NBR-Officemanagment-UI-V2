import { Download, Printer, ArrowLeft } from 'lucide-react';
import { AppModal } from '../../components/modals/AppModal';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { officeMoney, type OfficePaymentItem, type OfficeReceiptInfo } from './officeTransactionDetails';

type Props = {
  open: boolean;
  info: OfficeReceiptInfo;
  items: OfficePaymentItem[];
  language: string;
  onClose: () => void;
  onBack: () => void;
};

/** Export the exact approved paper displayed in the Office modal, never a separately designed HTML document. */
export function buildDisplayedOfficeReceiptDocument(paper: HTMLElement, title: string): string {
  const escapedTitle = title.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);
  const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map(link => '<link rel="stylesheet" href="' + link.href.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '">').join('');
  const lang = paper.getAttribute('lang') === 'bn' ? 'bn' : 'en';
  return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapedTitle + '</title>' +
    styles + '<style>@page{size:A4;margin:12mm}body{margin:0;padding:12mm;background:#fff}' +
    '.no-print,button{display:none!important}.office-receipt__paper{box-shadow:none!important;border:none!important;max-width:100%!important}' +
    '</style></head><body class="office-receipt__export">' + paper.outerHTML + '</body></html>';
}

export function OfficeReceiptModal({ open, info, items, language, onClose, onBack }: Props) {
  const bn = language.startsWith('bn');
  const label = (en: string, bangla: string) => bn ? bangla : en;
  const isTravelTax=items.length>0&&items.every(item=>item.service==='Travel Tax');
  const download = () => {
    const paper = document.getElementById('office-receipt-paper');
    if (!paper || !open) return;
    const html = buildDisplayedOfficeReceiptDocument(paper, label('Office payment receipt', 'অফিস পেমেন্ট রসিদ'));
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'office-payment-' + info.reference.replace(/[^a-zA-Z0-9-]/g,'').slice(0,64) + '.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const field = (name: string, value: string) => value && value !== '—' ? (
    <div className="office-receipt__detail receipt-view__detail" key={name}>
      <dt>{name}</dt><dd>{value}</dd>
    </div>
  ) : null;
  return (
    <AppModal open={open} onClose={onClose} size="xl"
      title={label('Payment receipt details', 'পেমেন্ট রসিদের বিবরণ')}
      footer={<>
        <span className="office-receipt__footer-back">
          <SecondaryButton size="sm" icon={ArrowLeft} onClick={onBack}>{label('Back to details', 'বিস্তারিত তথ্যে ফিরুন')}</SecondaryButton>
        </span>
        <SecondaryButton size="sm" icon={Download} onClick={download}>{label('Download', 'ডাউনলোড')}</SecondaryButton>
        <PrimaryButton size="sm" icon={Printer} onClick={() => window.print()}>{label('Print receipt', 'রসিদ প্রিন্ট')}</PrimaryButton>
      </>}
    >
      <article id="office-receipt-paper" className="office-receipt__paper receipt-view__paper receipt-view--embedded office-receipt-parity" data-testid="office-payment-receipt" lang={bn ? 'bn' : 'en'}>
        <header className="office-receipt__summary receipt-view__summary">
          <div>
            <p className="office-receipt__eyebrow receipt-view__eyebrow">{label('Payment record', 'পেমেন্ট রেকর্ড')}</p>
            <h3 className="office-receipt__receipt-heading">{label('Receipt details', 'রসিদের বিবরণ')}</h3>
            <p>{info.service}</p>
          </div>
          <div className="office-receipt__total receipt-view__amount">
            <p>{label('Total amount', 'সর্বমোট অর্থ')}</p>
            <strong>{info.amount}</strong>
          </div>
        </header>
        <section className="office-receipt__reference receipt-view__reference-strip">
          <div><p>{label('Transaction reference', 'লেনদেন রেফারেন্স')}</p><strong className="break-all">{info.reference}</strong></div>
          <div><p>{label('Date', 'তারিখ')}</p><strong>{info.date}</strong></div>
          {info.receiptReference&&<div>
            <p>{label('Receipt reference','রসিদ রেফারেন্স')}</p>
            <strong className="break-all">{info.receiptReference}</strong>
          </div>}
          {info.certificateReference&&<div>
            <p>{label('Certificate reference','সনদ রেফারেন্স')}</p>
            <strong className="break-all">{info.certificateReference}</strong>
          </div>}
        </section>
        {info.batchId&&<section className="office-receipt__reference receipt-view__reference-strip" data-testid="office-receipt-batch-identity">
          <div><p>{label('Batch reference','ব্যাচ রেফারেন্স')}</p><strong className="break-all">{info.batchId}</strong></div>
          {info.batchItemIndex&&info.batchItemCount&&<div>
            <p>{label('Record in batch','ব্যাচের রেকর্ড')}</p>
            <strong>{info.batchItemIndex}/{info.batchItemCount}</strong>
          </div>}
        </section>}
        <div className="office-receipt__columns receipt-view__parties">
          <section className="office-receipt__section receipt-view__section">
            <h4 className="receipt-view__section-title">{label('Payer and taxpayer details', 'করদাতা ও পরিশোধকারীর তথ্য')}</h4>
            <dl>
              {field(label('Payer', 'পরিশোধকারী'), info.payer)}
              {field(label('Taxpayer', 'করদাতা'), info.taxpayer)}
              {field(label('Payment service', 'পেমেন্টের ধরন'), info.service)}
              {field(label('Assessment year', 'করবর্ষ'), info.year)}
            </dl>
          </section>
          <section className="office-receipt__section receipt-view__section">
            <h4 className="receipt-view__section-title">{label('Payment and settlement', 'পেমেন্ট ও নিষ্পত্তির তথ্য')}</h4>
            <dl>
              {field(label('Payment method', 'পেমেন্ট পদ্ধতি'), info.method)}
              {field(label('Payment status', 'পেমেন্টের অবস্থা'), info.paymentStatus)}
              {field(label('Tax credit status', 'কর ক্রেডিটের অবস্থা'), info.creditStatus)}
            </dl>
          </section>
        </div>
        {info.giftDetails&&<section className="office-receipt__section receipt-view__section" data-testid="office-gift-tax-details">
          <h4 className="receipt-view__section-title">{label('Gift Tax details — simulated receipt','দানকরের তথ্য — নমুনা রসিদ')}</h4>
          <dl>{field(label('Donor','দাতা'),info.giftDetails.donor.name+' · '+info.giftDetails.donor.tin)}
            {field(label('Donee','গ্রহীতা'),info.giftDetails.donee.name+' · '+info.giftDetails.donee.tin)}
            {field(label('Relationship','সম্পর্ক'),info.giftDetails.donee.relationship??info.giftDetails.donee.otherLabel??info.giftDetails.donee.tag)}
            {field(label('Gift amount','দানের পরিমাণ'),officeMoney(info.giftDetails.giftAmountMinor,language))}
            {field(label('Gift date','দানের তারিখ'),info.giftDetails.giftDate)}
            {field(label('Description','দানের বিবরণ'),info.giftDetails.description)}
            {field(label('Remarks','মন্তব্য'),info.giftDetails.remarks)}</dl>
        </section>}
        {items.length > 0 && <section className="office-receipt__section office-receipt__breakdown receipt-view__breakdown">
          <h4 className="receipt-view__section-title">{isTravelTax
            ?label('Passenger payment breakdown','যাত্রীদের পেমেন্ট বিবরণ')
            :label('Payment breakdown and head classification', 'পেমেন্ট বিবরণ ও খাত')}</h4>
          <div className="office-receipt__scroll receipt-view__breakdown-content">
            <table className="receipt-view__financial-table">
              <thead><tr>
                <th>{isTravelTax?label('Passenger','যাত্রী'):label('Taxpayer / TIN', 'করদাতা / টিআইএন')}</th>
                <th>{isTravelTax?label('Service','সেবা'):label('Payment head', 'পেমেন্ট খাত')}</th>
                {!isTravelTax&&<th>{label('Assessment year', 'করবর্ষ')}</th>}
                <th className="office-receipt__numeric">{label('Amount (৳)', 'পরিমাণ (৳)')}</th>
              </tr></thead>
              <tbody>{items.map((item,index) => <tr key={index}>
                <td>{item.taxpayer}
                  {item.taxpayerTin&&!item.taxpayer.includes(item.taxpayerTin)&&<small className="block">{label('TIN','টিআইএন')}: {item.taxpayerTin}</small>}
                </td>
                <td>{item.service}{item.economicCode && <small>{label('Economic code', 'অর্থনৈতিক কোড')}: {item.economicCode}</small>}</td>
                {!isTravelTax&&<td>{item.assessmentYear}</td>}
                <td className="office-receipt__numeric">{officeMoney(item.amountMinor, language)}</td>
              </tr>)}</tbody>
              <tfoot><tr>
                <th colSpan={isTravelTax?2:3}>{label('Total amount', 'সর্বমোট অর্থ')}</th>
                <th className="office-receipt__numeric">{info.amount}</th>
              </tr></tfoot>
            </table>
          </div>
        </section>}
      </article>
    </AppModal>
  );
}
