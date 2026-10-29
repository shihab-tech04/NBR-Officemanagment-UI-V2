import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, Download, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ResponsiveOverlay } from '../../components/shared/ResponsiveOverlay';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { StatusBadge } from '../../components/badges/StatusBadge';
import type { TableRow } from '../modulePageUtils';
import type { StoryPayment } from './story1OfficeApi';
import { getOfficePaymentItems, officeMoney, officeReceiptHtml, type OfficeReceiptInfo } from './officeTransactionDetails';

type Props = { row: TableRow | null; source: StoryPayment | null; onClose: () => void };

const textValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : '—';

export function OfficeTransactionDrawer({ row, source, onClose }: Props) {
  const { t, i18n } = useTranslation('payment');
  const { t: common } = useTranslation('common');
  const [receipt, setReceipt] = useState(false);
  const language = i18n.resolvedLanguage || 'en';
  const bn = language.startsWith('bn');
  const label = (en: string, bangla: string) => bn ? bangla : en;
  const ref = textValue(row?.payment_ref);
  useEffect(() => { setReceipt(false); }, [ref]);
  const items = useMemo(() => getOfficePaymentItems(source), [source]);

  const info: OfficeReceiptInfo = {
    reference: ref,
    date: textValue(row?.date),
    payer: textValue(row?.payer_name),
    taxpayer: textValue(row?.taxpayer_name),
    service: textValue(row?.payment_type),
    year: textValue(row?.assessment_year),
    amount: textValue(row?.amount),
    paymentStatus: textValue(row?.financial_receipt_status),
    creditStatus: textValue(row?.ledger_status),
    method: textValue(row?.payment_channel),
  };
  const hasRecord = Boolean(row);
  const printReceipt = () => { if (hasRecord) window.print(); };
  const downloadReceipt = () => {
    if (!row) return;
    const html = officeReceiptHtml(info, items, language);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'office-payment-' + ref.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) + '.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const copyReference = () => {
    if (navigator.clipboard?.writeText && ref !== '—') {
      void navigator.clipboard.writeText(ref);
    }
  };
  const field = (name: string, value: string) =>
    value === '—' ? null : (
      <div className="office-tx__field" key={name}>
        <dt>{name}</dt>
        <dd>{value}</dd>
      </div>
    );
  if (!row) return null;

  return (
    <ResponsiveOverlay
      open={hasRecord}
      onClose={onClose}
      onBack={receipt ? () => setReceipt(false) : undefined}
      backLabel={label('Details', 'বিস্তারিত')}
      title={receipt ? label('Payment receipt', 'পেমেন্ট রসিদ') : label('Transaction details', 'লেনদেনের বিবরণ')}
      closeLabel={common('accessibility.closeDrawer')}
      desktopWidth={receipt ? '620px' : '520px'}
      className="office-transaction-drawer"
      footer={receipt
        ? <>
            <SecondaryButton size="sm" icon={Printer} onClick={printReceipt}>{label('Print', 'প্রিন্ট')}</SecondaryButton>
            <PrimaryButton size="sm" icon={Download} onClick={downloadReceipt}>{label('Download receipt', 'রসিদ ডাউনলোড')}</PrimaryButton>
          </>
        : <PrimaryButton size="sm" icon={FileText} onClick={() => setReceipt(true)}>
            {label('View receipt', 'রসিদ দেখুন')}
          </PrimaryButton>}
    >
      <article className={receipt ? 'office-tx office-tx--receipt' : 'office-tx'} data-testid={receipt ? 'office-payment-receipt' : 'office-transaction-details'}>
        <section className="office-tx__summary">
          <div className="office-tx__summary-main">
            <p className="office-tx__eyebrow">{label('Payment record', 'পেমেন্ট রেকর্ড')}</p>
            <h3>{info.taxpayer}</h3>
            <p>{info.date}</p>
          </div>
          <div className="office-tx__amount-block">
            <span>{t('colAmount')}</span>
            <strong>{info.amount}</strong>
            <StatusBadge value={info.paymentStatus}/>
          </div>
        </section>

        <section className="office-tx__section">
          <h3>{label('Transaction information', 'লেনদেনের তথ্য')}</h3>
          <dl className="office-tx__grid">
            {field(t('colPayer'), info.payer)}
            {field(t('colTaxpayer'), info.taxpayer)}
            {field('TIN', textValue(row.tin))}
            {field(t('Service'), info.service)}
            {field(t('ay'), info.year)}
            {field(label('Payment method', 'পেমেন্ট পদ্ধতি'), info.method)}
          </dl>
        </section>

        <section className="office-tx__section">
          <h3>{label('Payment status', 'পেমেন্টের অবস্থা')}</h3>
          <div className="office-tx__status-grid">
            <div><p>{label('Payment record', 'পেমেন্ট রেকর্ড')}</p><StatusBadge value={info.paymentStatus}/></div>
            <div><p>{label('Tax credit', 'কর ক্রেডিট')}</p><StatusBadge value={info.creditStatus}/></div>
          </div>
        </section>

        {items.length > 0 && (
          <section className="office-tx__section">
            <h3>{label('Taxpayer allocations', 'করদাতা অনুযায়ী বণ্টন')}</h3>
            <div className="office-tx__allocations">
              {items.map((item, index) => (
                <div className="office-tx__allocation" key={index}>
                  <div className="office-tx__allocation-top">
                    <h4>{item.taxpayer}</h4>
                    <strong>{officeMoney(item.amountMinor, language)}</strong>
                  </div>
                  <p>{item.service} · {item.assessmentYear}</p>
                  {item.economicCode && <p>{label('Economic code', 'অর্থনৈতিক কোড')}: {item.economicCode}</p>}
                  {item.authorization && <p>{label('Authorization', 'অনুমোদন')}: {item.authorization}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="office-tx__section">
          <h3>{label('References', 'রেফারেন্স')}</h3>
          <dl className="office-tx__grid office-tx__grid--single">
            <div className="office-tx__field">
              <dt>{label('Transaction ID', 'লেনদেন আইডি')}</dt>
              <dd className="office-tx__reference"><span>{ref}</span>
                {ref !== '—' && <button type="button" onClick={copyReference}
                  aria-label={label('Copy transaction ID', 'লেনদেন আইডি কপি করুন')}>
                  <Copy size={15}/></button>}
              </dd>
            </div>
            {field(label('Receipt reference', 'রসিদ রেফারেন্স'), textValue(row.acs_reference))}
            {field(label('Notice reference', 'নোটিশ রেফারেন্স'), textValue(row.notice_reference))}
          </dl>
        </section>
      </article>
    </ResponsiveOverlay>
  );
}
