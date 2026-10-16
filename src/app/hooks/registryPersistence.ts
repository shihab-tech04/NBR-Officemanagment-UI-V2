/** Browser-only registry persistence for the existing Office UI preview.
 * This is NOT an Office API, authorization source, or shared database.
 * Legacy arrays are still readable; the versioned form additionally remembers
 * removal of built-in fixture records so a deleted row cannot reappear.
 */
export interface RegistrySnapshot<T extends { id: string }> {
  records: T[];
  deletedIds: string[];
}

export function loadRegistrySnapshot<T extends { id: string }>(key: string): RegistrySnapshot<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { records: [], deletedIds: [] };
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { records: parsed as T[], deletedIds: [] };
    if (parsed && typeof parsed === "object") {
      const value = parsed as Partial<RegistrySnapshot<T>>;
      return {
        records: Array.isArray(value.records) ? value.records : [],
        deletedIds: Array.isArray(value.deletedIds)
          ? value.deletedIds.filter((id): id is string => typeof id === "string")
          : [],
      };
    }
  } catch {
    // Read-only fallback for unavailable/corrupt browser storage.
  }
  return { records: [], deletedIds: [] };
}

export function mergeRegistry<T extends { id: string }>(
  defaults: T[], snapshot: RegistrySnapshot<T>,
): T[] {
  const removed = new Set(snapshot.deletedIds);
  const changes = new Map(snapshot.records.map(record => [record.id, record]));
  const defaultIds = new Set(defaults.map(record => record.id));
  const created = snapshot.records.filter(record => !defaultIds.has(record.id) && !removed.has(record.id));
  const seeded = defaults.filter(record => !removed.has(record.id)).map(record => changes.get(record.id) ?? record);
  return [...created, ...seeded];
}

export function upsertRegistryRecord<T extends { id: string }>(
  snapshot: RegistrySnapshot<T>, record: T,
): RegistrySnapshot<T> {
  const exists = snapshot.records.some(item => item.id === record.id);
  return {
    records: exists
      ? snapshot.records.map(item => item.id === record.id ? record : item)
      : [...snapshot.records, record],
    deletedIds: snapshot.deletedIds.filter(id => id !== record.id),
  };
}

export function deleteRegistryRecord<T extends { id: string }>(
  snapshot: RegistrySnapshot<T>, id: string, defaults: T[],
): RegistrySnapshot<T> {
  return {
    records: snapshot.records.filter(record => record.id !== id),
    deletedIds: defaults.some(record => record.id === id)
      ? [...new Set([...snapshot.deletedIds, id])]
      : snapshot.deletedIds.filter(deletedId => deletedId !== id),
  };
}
