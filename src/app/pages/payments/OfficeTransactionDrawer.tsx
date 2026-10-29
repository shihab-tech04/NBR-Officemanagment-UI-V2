import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DynamicDetailsDrawer } from '../../components/drawers/DynamicDetailsDrawer';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import type { TableRow } from '../modulePageUtils';
import type { StoryPayment } from './story1OfficeApi';
import { getOfficePaymentItems, officeMoney, type OfficeReceiptInfo } from './officeTransactionDetails';
import { OfficeReceiptModal } from './OfficeReceiptModal';

type Props = { row: TableRow | null; source: StoryPayment | null; onClose: () => void };
const display = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : '—';

/** Office register details use exactly the shared DynamicDetailsDrawer design.
 * Receipt is a separate shared AppModal document, never another drawer layout. */
export function OfficeTransactionDrawer({ row, source, onClose }: Props) {
  const { t, i18n } = useTranslation('payment');
  const [receipt, setReceipt] = useState(false);
  const language = i18n.resolvedLanguage || 'en';
  const bn = language.startsWith('bn');
  const label = (en: string, bangla: string) => bn ? bangla : en;
  const ref = display(row?.payment_ref);
  useEffect(() => { setReceipt(false); }, [ref]);
  const items = useMemo(() => getOfficePaymentItems(source), [source]);
  const info: OfficeReceiptInfo = {
    reference: ref, date: display(row?.date), payer: display(row?.payer_name),
    taxpayer: display(row?.taxpayer_name), service: display(row?.payment_type),
    year: display(row?.assessment_year), amount: display(row?.amount),
    paymentStatus: display(row?.financial_receipt_status),
    creditStatus: display(row?.ledger_status), method: display(row?.payment_channel),
  };

  // Explicit presentation whitelist: never pass serialized allocation JSON,
  // audit internals, or arbitrary database fields to the shared drawer.
  const detailRow: TableRow | null = row ? {
    taxpayer_name: info.taxpayer,
    status: info.paymentStatus,
    tin: display(row.tin),
    date: info.date,
    payer_name: info.payer,
    payment_type: info.service,
    assessment_year: info.year,
    amount: info.amount,
    payment_channel: info.method,
    ledger_status: info.creditStatus,
    ...(items.length ? { allocation_items: String(items.length) } : {}),
    payment_ref: info.reference,
    acs_reference: display(row.acs_reference),
    notice_reference: display(row.notice_reference),
  } : null;
  const groups: Array<[string, string, string]> = [
    ['payer_name', t('colPayer'), label('Payment information','পেমেন্টের তথ্য')],
    ['payment_type', t('Service'), label('Payment information','পেমেন্টের তথ্য')],
    ['assessment_year', t('ay'), label('Payment information','পেমেন্টের তথ্য')],
    ['amount', t('colAmount'), label('Payment information','পেমেন্টের তথ্য')],
    ['payment_channel', label('Payment method','পেমেন্ট পদ্ধতি'),label('Payment information','পেমেন্টের তথ্য')],
    ['ledger_status',label('Tax credit status','কর ক্রেডিটের অবস্থা'),label('Payment status','পেমেন্টের অবস্থা')],
    ['allocation_items',label('Taxpayer allocations','করদাতা অনুযায়ী বণ্টন'),label('Taxpayer allocations','করদাতা অনুযায়ী বণ্টন')],
    ['payment_ref',label('Transaction ID','লেনদেন আইডি'),label('References','রেফারেন্স')],
    ['acs_reference',label('Receipt reference','রসিদ রেফারেন্স'),label('References','রেফারেন্স')],
    ['notice_reference',label('Notice reference','নোটিশ রেফারেন্স'),label('References','রেফারেন্স')],
  ];

  const renderValue = (key: string) => key === 'allocation_items' ? (
    <div className="office-shared-allocation-list">
      {items.map((item, index) => (
        <div className="office-shared-allocation-list__item" key={index}>
          <p><strong>{item.taxpayer}</strong><strong>{officeMoney(item.amountMinor, language)}</strong></p>
          <p>{item.service} · {item.assessmentYear}</p>
          {item.economicCode && <p>{label('Economic code', 'অর্থনৈতিক কোড')}: {item.economicCode}</p>}
          {item.authorization && <p>{label('Authorization', 'অনুমোদন')}: {item.authorization}</p>}
        </div>
      ))}
    </div>
  ) : undefined;

  return (
    <>
      <DynamicDetailsDrawer
        open={!!detailRow && !receipt}
        onClose={onClose}
        title={label('Record Details','রেকর্ডের বিবরণ')}
        rowData={receipt ? null : detailRow}
        columns={groups.map(([key, fieldLabel, groupLabel]) => ({ key, label: fieldLabel, groupLabel }))
          .concat([
            { key:'taxpayer_name',label:t('colTaxpayer'),groupLabel:'' },
            { key:'status',label:label('Payment status','পেমেন্টের অবস্থা'),groupLabel:'' },
            { key:'tin',label:'TIN',groupLabel:'' },
            { key:'date',label:t('colDate'),groupLabel:'' },
          ])}
        showActions={false}
        renderValue={renderValue}
        extraFooterActions={<PrimaryButton size="sm" icon={FileText} onClick={() => setReceipt(true)}>
          {label('View receipt','রসিদ দেখুন')}
        </PrimaryButton>}
      />
      <OfficeReceiptModal
        open={!!detailRow && receipt}
        info={info}
        items={items}
        language={language}
        onBack={() => setReceipt(false)}
        onClose={() => { setReceipt(false); onClose(); }}
      />
    </>
  );
}
