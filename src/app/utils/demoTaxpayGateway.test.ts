import { describe, expect, it } from 'vitest';
import { getTaxPayDemoLoginUrl } from './demoTaxpayGateway';

describe('password-free TaxPay demo routing', () => {
 it('maps only the ten approved IDs to the TaxPay public demonstration', () => {
  for (let number=1; number<=10; number++) {
    const url = getTaxPayDemoLoginUrl('user'+number);
    expect(url).not.toBeNull();
    const target = new URL(url!);
    expect(target.origin).toBe('https://shihab-tech04.github.io');
    expect(target.pathname).toBe('/nbr-taxpay/');
    expect(target.searchParams.get('action')).toBe('taxpayer_home');
    expect(target.searchParams.get('demoUser')).toBe('user'+number);
  }
 });
 it('never interprets arbitrary admin IDs, URLs or malformed inputs as demo users', () => {
  for(const value of ['admin','', 'user0','user11','user100','user1/..','user1&action=officer_home','http://example.com','  user 1']) {
   expect(getTaxPayDemoLoginUrl(value)).toBeNull();
  }
 });
});
