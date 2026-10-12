import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const modal=read('src/styles/modals.css');
const globals=read('src/styles/globals.css');
const payment=read('src/app/pages/payments/PaymentModulePage.tsx');
const audit=read('src/app/pages/audit/InitiateAuditPage.tsx');
const roles=read('src/app/components/roles/CreateEditRoleModal.tsx');
describe('all modal footer system parity',()=>{
 it('uses compact audit-candidates footer button sizes and no duplicate container',()=>{
  expect(audit).toContain('footer={modalFooter}');
  expect(audit).toContain('<PrimaryButton size="sm"');
  expect(payment).toContain('<SecondaryButton size="sm"');
  expect(payment).toContain('<PrimaryButton size="sm"');
 });
 it('normalizes direct buttons in shared modal and legacy modal footers',()=>{
  expect(modal).toContain('.app-modal-footer > .app-btn {');
  expect(modal).toContain('width: auto;');
  expect(modal).toContain('.app-modal-footer > .app-btn--md {');
  expect(globals).toContain('.modal-footer > .app-btn--md {');
 });
 it('preserves wizard wrappers, danger separation and mobile bottom sheet sizing',()=>{
  expect(modal).toContain('.app-modal-footer > .crm-footer,');
  expect(modal).toContain('.app-modal-footer .app-btn--danger');
  expect(modal).toContain('min-height: 44px;');
  expect(roles).toContain('className="crm-footer"');
 });
});
