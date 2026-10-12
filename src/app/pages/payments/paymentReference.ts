/**
 * TaxPay v11 Officer Workspace controlled REFERENCE snapshots, 12 Oct 2026.
 * All records are fictional prototype material. These are NOT NBR, Treasury,
 * ACS, eReturn or eLedger authoritative records, and may not confer tax credit.
 * Keep financial-receipt and tax-credit states separate.
 */
export type ReceiptStatus = 'Failed' | 'Awaiting bank payment' | 'Received by Government';
export type CreditStatus = 'Not yet credited' | 'Eligible — credited' | 'Blocked — under review';
export type PaymentSnapshot = {
  key: string; taxpayer_name: string; tin: string; payer_name: string;
  type: string; ay: string; iy: string; amount: number; date: string;
  financial_receipt_status: ReceiptStatus; tax_credit_status: CreditStatus;
  tax_event_id: string; payment_transaction_id: string; acs_reference: string;
  payment_channel: string; note: string;
};

export const referencePayments: ReadonlyArray<PaymentSnapshot> = [
  { key:'v11-failed-42500',taxpayer_name:'Md. Rahman',tin:'123456789012',payer_name:'Md. Rahman',type:'Advance Tax',ay:'2027–28',iy:'2026–27',amount:42500,date:'12 Oct 2026',financial_receipt_status:'Failed',tax_credit_status:'Not yet credited',tax_event_id:'TE-2026-000185',payment_transaction_id:'PT-2026-000922',acs_reference:'ACS-2026-784538',payment_channel:'bKash (illustrative)',note:'Channel declined authorization; no Treasury settlement or eligible credit.'},
  { key:'v11-awaiting-62500',taxpayer_name:'Md. Rahman',tin:'123456789012',payer_name:'Md. Rahman',type:'Advance Tax',ay:'2027–28',iy:'2026–27',amount:62500,date:'09 Oct 2026',financial_receipt_status:'Awaiting bank payment',tax_credit_status:'Not yet credited',tax_event_id:'',payment_transaction_id:'',acs_reference:'',payment_channel:'Bank counter (illustrative)',note:'Challan reference and full transaction identity are not independently evidenced.'},
  { key:'v11-credited-20000',taxpayer_name:'Md. Rahman',tin:'123456789012',payer_name:'Md. Abdul Karim',type:'Advance Tax',ay:'2027–28',iy:'2026–27',amount:20000,date:'20 Sep 2026',financial_receipt_status:'Received by Government',tax_credit_status:'Eligible — credited',tax_event_id:'',payment_transaction_id:'',acs_reference:'',payment_channel:'Illustrative',note:'Payer differs from taxpayer. Prototype shows credited; not verified in real ledger.'},
  { key:'v11-blocked-100000',taxpayer_name:'Md. Abdul Karim',tin:'987654321098',payer_name:'Md. Rahman',type:'Tax with Return',ay:'2025–26',iy:'2024–25',amount:100000,date:'12 Sep 2026',financial_receipt_status:'Received by Government',tax_credit_status:'Blocked — under review',tax_event_id:'',payment_transaction_id:'',acs_reference:'',payment_channel:'Illustrative',note:'Government receipt does not establish entitlement; subject of an example wrong-year correction.'},
  { key:'v11-failed-25000',taxpayer_name:'Md. Rahman',tin:'123456789012',payer_name:'Md. Rahman',type:'Assessed Demand',ay:'2025–26',iy:'2024–25',amount:25000,date:'03 Sep 2026',financial_receipt_status:'Failed',tax_credit_status:'Not yet credited',tax_event_id:'',payment_transaction_id:'',acs_reference:'',payment_channel:'Illustrative',note:'Screenshot-observed status; full source identifiers not evidenced.'},
];

export const referenceTaxpayers = [
  { name:'Md. Rahman',tin:'123456789012',zone:'Taxes Zone-7, Dhaka',circle:'Circle-112',status:'Active',type:'Individual',nid:'•••• •• •••• 4471',phone:'017•••••458' },
  { name:'Md. Abdul Karim',tin:'987654321098',zone:'—',circle:'—',status:'Reference',type:'Individual',nid:'—',phone:'—' },
  { name:'Rupali Traders Ltd.',tin:'5554487213600',zone:'—',circle:'—',status:'Reference',type:'Company',nid:'—',phone:'—' },
  { name:'Ms. Nasrin Akter',tin:'445566778899',zone:'—',circle:'—',status:'Reference',type:'Individual',nid:'—',phone:'—' },
  { name:'Karim Autos',tin:'112233445566',zone:'—',circle:'—',status:'Reference',type:'Business',nid:'—',phone:'—' },
  { name:'Mr. Tanvir Hasan',tin:'667788990011',zone:'—',circle:'—',status:'Reference',type:'Individual',nid:'—',phone:'—' },
] as const;
export const referenceCorrections = [
  { id:'CR-2026-000045',taxpayer:'Md. Abdul Karim',requester:'Md. Rahman (payer)',reason:'Wrong assessment year selected',amount:100000,stage:'With Reviewer',status:'Blocked',evidence:'Not independently verified',before:'AY 2025–26',after:'Year-change requested; no credit transfer authorized' },
  { id:'CR-2026-000031',taxpayer:'Md. Rahman',requester:'Md. Rahman (taxpayer)',reason:'Wrong assessment year selected',amount:50000,stage:'Decided (illustrative)',status:'Decided',evidence:'Not independently verified',before:'—',after:'—' },
] as const;
export const referenceOffline = [
  { id:'OFE-2026-000008',taxpayer:'Md. Rahman',tin:'123456789012',event:'LIABILITY_REDUCED',component:'Assessed Demand',reduces:'Interest',ay:'2025–26',amount:-5000,order:'TO-2026-118 (illustrative)',source:'Tribunal order (illustrative)',maker:'S. Islam',status:'Pending',approver:'Different officer required' },
] as const;
export const referenceIntelligence = {
  scope:'Last 30 days — fictional v11 design reference',
  volume:18420,successful:17395,failed:612,pending:413,abandonment:'11.8%',wrongSection:1284,wrongYear:2105,corrections:188,invalidatedCredits:98,
} as const;

export const referenceAudit = [
  { id:'AUD-2026-001323',date:'12 Oct 2026 15:09',actor:'F. Ahmed (Reviewer)',system:'Officer Workspace',action:'OFFICER_SIGN_IN',reason:'Simulated role sign-in' },
  { id:'AUD-2026-001322',date:'12 Oct 2026 15:07',actor:'Md. Rahman',system:'NBR Portal (demo)',action:'CERTIFICATE_GENERATED',reason:'Illustrative certificate event' },
  { id:'AUD-2026-001321',date:'12 Oct 2026 15:04',actor:'ACS (demo)',system:'Payment simulation',action:'PAYMENT_FAILED',reason:'Channel declined authorization' },
  { id:'AUD-2026-001320',date:'12 Oct 2026 15:04',actor:'ACS (demo)',system:'Payment simulation',action:'ACS_REFERENCE_CREATED',reason:'Challan generated' },
  { id:'AUD-2026-001319',date:'12 Oct 2026 15:04',actor:'Md. Rahman',system:'NBR Portal (demo)',action:'PAYMENT_INITIATED',reason:'Payment intent created' },
] as const;

/** Explicitly non-executable: officer authentication, credit posting and evidence storage are absent. */
export function canPostOfficerMutation(_role?: string): false { return false; }
export function totalReceived(snapshots: ReadonlyArray<PaymentSnapshot>) {
  return snapshots.filter(p => p.financial_receipt_status === 'Received by Government').reduce((n,p)=>n+p.amount,0);
}
export function totalEligible(snapshots: ReadonlyArray<PaymentSnapshot>) {
  return snapshots.filter(p => p.tax_credit_status === 'Eligible — credited').reduce((n,p)=>n+p.amount,0);
}