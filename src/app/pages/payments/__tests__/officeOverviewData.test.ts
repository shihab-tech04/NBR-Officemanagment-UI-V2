import { describe, expect, it, vi } from 'vitest';
import type { StoryPayment } from '../story1OfficeApi';
import { availableOfficeOverviewSummary, createSingleFlight } from '../officeOverviewData';

const payment:StoryPayment={
  id:'source-1',service:'OTHER_TAX_PAYMENT',amountMinor:5000,
  status:'SIMULATED_SUCCESS',createdAt:'2026-11-05T05:00:00Z',
  details:{assessmentYear:'2026-27'}
};

describe('Office Payments Overview data readiness',()=>{
  it('does not show false zero KPIs before the complete paginated fetch resolves',()=>{
    expect(availableOfficeOverviewSummary([],[],'all',true,'')).toBeNull();
  });
  it('does not treat a failed feed as a verified empty result or show stale counts',()=>{
    expect(availableOfficeOverviewSummary([payment],[],'all',false,'unavailable')).toBeNull();
  });
  it('reports a genuine empty result as zero only after a successful read',()=>{
    const summary=availableOfficeOverviewSummary([],[],'all',false,'');
    expect(summary?.count).toBe(0);
    expect(summary?.amountMinor).toBe(0);
  });
  it('uses the same payment source and assessment-year filter for actual summary values',()=>{
    const included=availableOfficeOverviewSummary([payment],[],'2026-27',false,'');
    expect(included?.count).toBe(1);
    expect(included?.amountMinor).toBe(5000);
    expect(availableOfficeOverviewSummary([payment],[],'2025-26',false,'')?.count).toBe(0);
  });
  it('coalesces overlapping full-history refreshes and permits the next completed refresh',async()=>{
    let finish!: (value:number)=>void;
    const job=vi.fn().mockImplementationOnce(()=>new Promise<number>(resolve=>{finish=resolve;})).mockResolvedValueOnce(2);
    const refresh=createSingleFlight(job);
    const first=refresh();const second=refresh();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(job).toHaveBeenCalledTimes(1);
    finish(1);
    expect(await first).toBe(1);
    expect(await refresh()).toBe(2);
    expect(job).toHaveBeenCalledTimes(2);
  });
  it('releases its single-flight lock after a failed refresh',async()=>{
    const job=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(3);
    const refresh=createSingleFlight(job);
    await expect(refresh()).rejects.toThrow('offline');
    expect(await refresh()).toBe(3);
  });
});
