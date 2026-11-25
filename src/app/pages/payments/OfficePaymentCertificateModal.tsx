import { useRef, useState } from 'react';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { AppModal } from '../../components/modals/AppModal';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { PaymentCertificateDocument } from './canonicalCertificate/components/common/PaymentCertificateDocument';
import { downloadDisplayedCertificate } from './canonicalCertificate/services/receiptDocumentExport';
import type { ChallanReceipt } from './canonicalCertificate/types/tax';

type Props={receipt:ChallanReceipt;language:'en'|'bn';onBack:()=>void;onClose:()=>void};
export function OfficePaymentCertificateModal({receipt,language,onBack,onClose}:Props){
  const paper=useRef<HTMLDivElement>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const label=(en:string,bn:string)=>language==='bn'?bn:en;
  const download=async()=>{
    if(!paper.current||busy)return;
    setBusy(true);setError(false);
    try{await downloadDisplayedCertificate(receipt,paper.current,true);}
    catch{setError(true);}
    finally{setBusy(false);}
  };
  return <AppModal open onClose={onClose} size="xl" title={label('Sohojkor Payment Certificate','সহজকর পেমেন্ট সনদ')}
    footer={<><span className="office-receipt__footer-back"><SecondaryButton size="sm" icon={ArrowLeft} onClick={onBack}>{label('Back to details','বিস্তারিত তথ্যে ফিরুন')}</SecondaryButton></span>
      <SecondaryButton size="sm" icon={Download} disabled={busy} onClick={()=>void download()}>{label('Download PDF','পিডিএফ ডাউনলোড')}</SecondaryButton>
      <PrimaryButton size="sm" icon={Printer} onClick={()=>window.print()}>{label('Print certificate','সনদ প্রিন্ট')}</PrimaryButton></>}>
    {error&&<p role="alert" className="no-print">{label('Unable to download the certificate. Try again.','সনদ ডাউনলোড করা যায়নি। আবার চেষ্টা করুন।')}</p>}
    <div ref={paper} id="office-receipt-paper" className="receipt-view__paper receipt-view--embedded office-receipt-parity" lang={language}>
      <PaymentCertificateDocument receipt={receipt} language={language}/>
    </div>
  </AppModal>;
}
