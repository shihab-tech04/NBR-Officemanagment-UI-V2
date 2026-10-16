import { useState, useEffect, useCallback } from "react";
import { MOCK_ROLES, type SystemRole } from "../data/mockData";
import {
  deleteRegistryRecord, loadRegistrySnapshot, mergeRegistry, upsertRegistryRecord,
  type RegistrySnapshot,
} from "./registryPersistence";

export const ROLE_STORAGE_KEY = "nbr.roleRegistry.customRoles";
export const ROLE_EVENT = "nbr:roles-updated";

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadCustom(): RegistrySnapshot<SystemRole> {
  return loadRegistrySnapshot<SystemRole>(ROLE_STORAGE_KEY);
}

function saveCustom(snapshot: RegistrySnapshot<SystemRole>): void {
  try {
    localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(ROLE_EVENT));
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useRoleRegistry() {
  const [custom, setCustom] = useState<RegistrySnapshot<SystemRole>>(loadCustom);

  useEffect(() => {
    const sync = () => setCustom(loadCustom());
    window.addEventListener("storage", sync);
    window.addEventListener(ROLE_EVENT, sync);

    // When a custom permission is deleted, strip that permission ID from every role
    const onPermDeleted = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const snapshot = loadCustom();
      // Also need to strip from base-roles-in-local-state — save them all.
      const allMerged = mergeRegistry(MOCK_ROLES, snapshot);
      const patchedAll = allMerged.map((r) => ({
        ...r,
        permissions: r.permissions.filter((pid) => pid !== id),
      }));
      // Preserve every modified field (name/status/level as well as permissions)
      // when a permission is removed; otherwise a permissions event can silently
      // reset edits to seeded roles.
      const toSave = patchedAll.filter((r) => {
        const base = MOCK_ROLES.find((m) => m.id === r.id);
        if (!base) return true; // new custom
        return JSON.stringify(r) !== JSON.stringify(base);
      });
      const updated = { ...snapshot, records: toSave };
      setCustom(updated);
      saveCustom(updated);
    };
    window.addEventListener("nbr:permission-deleted", onPermDeleted);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ROLE_EVENT, sync);
      window.removeEventListener("nbr:permission-deleted", onPermDeleted);
    };
  }, []);

  const roles: SystemRole[] = mergeRegistry(MOCK_ROLES, custom);
  const activeRoles: SystemRole[] = roles.filter((r) => r.status === "Active");

  const addRole = useCallback((role: SystemRole) => {
    const updated = upsertRegistryRecord(loadCustom(), role);
    setCustom(updated);
    saveCustom(updated);
  }, []);

  const updateRole = useCallback((role: SystemRole) => {
    const updated = upsertRegistryRecord(loadCustom(), role);
    setCustom(updated);
    saveCustom(updated);
  }, []);

  const deleteRole = useCallback((id: string) => {
    const updated = deleteRegistryRecord(loadCustom(), id, MOCK_ROLES);
    setCustom(updated);
    saveCustom(updated);
  }, []);

  const duplicateRole = useCallback((source: SystemRole): SystemRole => {
    const clone: SystemRole = {
      ...source,
      id: `r${Date.now()}`,
      name: `${source.name} (Copy)`,
      usersCount: 0,
    };
    const updated = upsertRegistryRecord(loadCustom(), clone);
    setCustom(updated);
    saveCustom(updated);
    return clone;
  }, []);

  const removePermissionFromRoles = useCallback((permissionId: string) => {
    const snapshot = loadCustom();
    const allMerged = mergeRegistry(MOCK_ROLES, snapshot);
    const toSave = allMerged
      .map((r) => ({ ...r, permissions: r.permissions.filter((pid) => pid !== permissionId) }))
      .filter((r) => {
        const base = MOCK_ROLES.find((m) => m.id === r.id);
        if (!base) return true;
        return JSON.stringify(r) !== JSON.stringify(base);
      });
    const updated = { ...snapshot, records: toSave };
    setCustom(updated);
    saveCustom(updated);
  }, []);

  return {
    roles,
    activeRoles,
    addRole,
    updateRole,
    deleteRole,
    duplicateRole,
    removePermissionFromRoles,
  };
}
