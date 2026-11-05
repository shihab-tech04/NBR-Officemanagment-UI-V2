import type { StoryNotice, StoryPayment } from './story1OfficeApi';
import { summarizeMirroredDemoPayments } from './story1SqlSummary';

/** An empty collection is a legitimate zero only after the complete SQL read succeeds.
 * Never turn a loading or unavailable feed into an apparent zero-payment report. */
export function availableOfficeOverviewSummary(
  payments: readonly StoryPayment[], notices: readonly StoryNotice[],
  assessmentYear: string, loading: boolean, error: string,
): ReturnType<typeof summarizeMirroredDemoPayments> | null {
  return loading || Boolean(error) ? null : summarizeMirroredDemoPayments(payments, notices, assessmentYear);
}

/** Reuse the pending promise rather than launching concurrent full-history scans. */
export function createSingleFlight<T>(job: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null;
  return () => {
    if (!active) {
      active = Promise.resolve().then(job).finally(() => { active = null; });
    }
    return active;
  };
}
