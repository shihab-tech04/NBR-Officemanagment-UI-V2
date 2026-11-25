import { describe,it,expect } from 'vitest';
import { officeCertificateReceipt } from '../officeCertificateProjection';
import { buildPaymentCertificateModel } from '../canonicalCertificate/services/paymentCertificateModel';
import type { StoryPayment } from '../story1OfficeApi';
const id='3f3a5de8-1f5b-45a4-8a76-87c53e72c001';
const base:StoryPayment={id,service:'PENALTY',amountMinor:5000,status:'SIMULATED_SUCCESS',createdAt:'2026-11-12T04:30:00Z',certificateReference:'SK-PC-'+id,
 details:{payerName:'Payer One',payerTin:'111111111111',taxpayerName:'Recipient One',taxpayerTin:'222222222222',assessmentYear:'2026-27',payerMode:'OTHER',receiptReference:'CH-2026-00051',
 lines:[{headId:120,headNameEn:'Penalty',economicCode:'1-1001-0000-1201',taxAmount:0,penaltyAmount:50,surchargeAmount:0,interestAmount:0,totalAmount:50,amountMinor:5000}]}};
describe('Office canonical certificate',()=>{
 it('uses the canonical parent-linked model for a reconciled authorized row',()=>{
   const r=officeCertificateReceipt(base,id,'৳50');expect(r).not.toBeNull();
   expect(buildPaymentCertificateModel(r!)?.certificateReference).toBe('SK-PC-'+id);
   expect(buildPaymentCertificateModel(r!)?.totalMinor).toBe(5000);
   expect(officeCertificateReceipt(base,id,'৳50','222222222222')).not.toBeNull();
 });
 it('fails closed for different row, scope, displayed amount, missing ref or ineligible payment',()=>{
   expect(officeCertificateReceipt(base,'wrong','৳50')).toBeNull();
   expect(officeCertificateReceipt(base,id,'৳51')).toBeNull();
   expect(officeCertificateReceipt(base,id,'৳50','999999999999')).toBeNull();
   expect(officeCertificateReceipt({...base,certificateReference:undefined},id,'৳50')).toBeNull();
   expect(officeCertificateReceipt({...base,status:'PENDING'},id,'৳50')).toBeNull();
   expect(officeCertificateReceipt({...base,service:'GIFT_TAX'},id,'৳50')).toBeNull();
 });
});
