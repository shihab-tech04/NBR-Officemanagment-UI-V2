import { describe, expect, it } from 'vitest';
import { OFFICE_PUBLIC_UI_ONLY } from './officeAccessMode';
import { getOfficeReviewClient } from '../pages/payments/OfficeReviewQueue';

describe('open Office UI SQL boundary',()=>{
  it('does not create a privileged review client for public visitors',()=>{
    expect(OFFICE_PUBLIC_UI_ONLY).toBe(true);
    expect(getOfficeReviewClient()).toBeNull();
  });
});
