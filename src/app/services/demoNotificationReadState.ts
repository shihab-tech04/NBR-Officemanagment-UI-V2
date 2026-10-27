/** Read receipts for the PUBLIC demo notification bell, scoped to this browser tab.
 * Not shared account persistence, identity, tax credit, or authenticated officer notices.
 * Protected per-officer notifications must continue to use Office SQL RPCs.
 */
const KEY = 'office-demo-notice-read-v1';
const paymentId = /^sql-payment-[1-9][0-9]{0,15}$/;
export type DemoNoticeReadState = { ids: string[]; readThroughMs: number | null };
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;
const inThisTab = (): KeyValueStore | null => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; }
  catch { return null; }
};
export function readDemoNoticeState(store: KeyValueStore | null = inThisTab()): DemoNoticeReadState {
  if (!store) return { ids: [], readThroughMs: null };
  try {
    const raw = store.getItem(KEY);
    if (!raw || raw.length > 20000) return { ids: [], readThroughMs: null };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { ids: [], readThroughMs: null };
    const item = data as Record<string, unknown>;
    const ids = Array.isArray(item.ids) ?
      [...new Set(item.ids.filter((v): v is string => typeof v === 'string' && paymentId.test(v)))].slice(-100) : [];
    const readThroughMs = typeof item.readThroughMs === 'number' &&
      Number.isSafeInteger(item.readThroughMs) && item.readThroughMs >= 0 ? item.readThroughMs : null;
    return { ids, readThroughMs };
  } catch { return { ids: [], readThroughMs: null }; }
}
export function markDemoNoticeViewed(id: string, store: KeyValueStore | null = inThisTab()): void {
  if (!store || !paymentId.test(id)) return;
  try {
    const previous = readDemoNoticeState(store);
    store.setItem(KEY, JSON.stringify({ ...previous, ids: [...new Set([...previous.ids, id])].slice(-100) }));
  } catch { /* the in-memory bell still works when browser storage is blocked */ }
}
export function markAllDemoNoticesViewed(ids: string[], time = Date.now(),
  store: KeyValueStore | null = inThisTab()): void {
  if (!store) return;
  try {
    const previous = readDemoNoticeState(store);
    const valid = ids.filter(id => paymentId.test(id));
    store.setItem(KEY, JSON.stringify({
      ids: [...new Set([...previous.ids, ...valid])].slice(-100),
      readThroughMs: Number.isSafeInteger(time) && time >= 0 ?
        Math.max(previous.readThroughMs ?? 0, time) : previous.readThroughMs
    }));
  } catch { /* no authentication decisions depend on this hint */ }
}
