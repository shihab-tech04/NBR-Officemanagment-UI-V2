/** The eight TaxPay service identities, shared by codes and legacy display labels. */
const paymentServiceCodes = {
  TAX_WITH_RETURN: 'Tax with Return',
  ADVANCE_TAX: 'Advance Tax',
  ASSESSED_DEMAND: 'Assessed Demand',
  PENALTY: 'Penalty',
  SOURCE_TAX_DEPOSIT: 'Source Tax Deposit',
  APPELLATE_TRIBUNAL: 'Appellate Tribunal',
  OTHER_TAX_PAYMENT: 'Other Tax Payment',
  TRAVEL_TAX: 'Travel Tax',
} as const;

type PaymentServiceCode = keyof typeof paymentServiceCodes;

function getServiceCode(label: string): PaymentServiceCode | undefined {
  const name = label.trim();
  return (Object.keys(paymentServiceCodes) as PaymentServiceCode[]).find(code =>
    code === name || paymentServiceCodes[code].toLowerCase() === name.toLowerCase()
  );
}

/** Unknown categories keep their original text; no incorrect color assignment. */
export function PaymentCategoryTag({ value }: { value: string }) {
  return <span className="payment-service-list">{value.split(',').map((part, index) => {
    const name = part.trim();
    const code = getServiceCode(name);
    return <span key={`${index}-${name}`}>
      {index > 0 && <span className="payment-service-list__separator">, </span>}
      {code ? <span className="payment-service-tag" data-payment-service={code}>{name}</span> : name}
    </span>;
  })}</span>;
}
