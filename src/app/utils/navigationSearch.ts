import { NAVIGATION } from '../data/navigation';

export interface NavigationDestination {
  path: string;
  label: string;
  section: string;
}

/** Search real, advertised Office destinations; never fabricate record results. */
export function findNavigationDestinations(
  query: string,
  translate: (key: string, fallback: string) => string = (_key, fallback) => fallback,
  limit = 8,
): NavigationDestination[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const labelFor = (key: string | undefined, fallback: string) => key
    ? translate(key.replace(/^navigation\./, ''), fallback)
    : fallback;
  const destinations: NavigationDestination[] = [];
  for (const group of NAVIGATION) {
    const section = labelFor(group.labelKey, group.label);
    for (const child of group.children) {
      const parent = labelFor(child.labelKey, child.label);
      const grandchildren = child.children?.length ? child.children : [null];
      for (const grandchild of grandchildren) {
        const label = grandchild
          ? labelFor(grandchild.labelKey, grandchild.label)
          : parent;
        const path = grandchild
          ? `/${group.id}/${child.id}/${grandchild.id}`
          : `/${group.id}/${child.id}`;
        const searchable = `${label} ${parent} ${section} ${path}`.toLocaleLowerCase();
        if (searchable.includes(term)) destinations.push({ path, label, section });
        if (destinations.length >= limit) return destinations;
      }
    }
  }
  return destinations;
}
