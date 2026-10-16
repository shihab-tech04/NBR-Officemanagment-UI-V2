import { describe, it, expect } from 'vitest';
import { findNavigationDestinations } from './navigationSearch';

describe('Office header navigation search', () => {
  it('resolves real leaf routes, including nested routes', () => {
    expect(findNavigationDestinations('taxpayer ledger')).toContainEqual({
      path: '/case-financial/demand-payment/taxpayer-ledger',
      label: 'Taxpayer Ledger', section: 'Case & Financial Management',
    });
    expect(findNavigationDestinations('tax years')).toContainEqual({
      path: '/administration/rules-calculation/tax-years',
      label: 'Tax Years', section: 'Administration & Requests',
    });
  });
  it('limits results and never pretends to find individual taxpayer data', () => {
    expect(findNavigationDestinations('')).toEqual([]);
    expect(findNavigationDestinations('no-such-taxpayer-99999')).toEqual([]);
    expect(findNavigationDestinations('report', undefined, 4)).toHaveLength(4);
  });
  it('searches translated labels in Bengali using the navigation namespace keys', () => {
    const matches = findNavigationDestinations('নিবন্ধন', (key, fallback) =>
      key === 'registerStock.taxRegistry' ? 'কর নিবন্ধন' : fallback);
    expect(matches).toContainEqual({
      path: '/register-stock/tax-registry', label: 'কর নিবন্ধন', section: 'Register & Stock',
    });
  });
});
