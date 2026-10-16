import { useState, useEffect, useCallback } from "react";
import { MOCK_USERS, type SystemUser } from "../data/mockData";
import {
  deleteRegistryRecord, loadRegistrySnapshot, mergeRegistry, upsertRegistryRecord,
  type RegistrySnapshot,
} from "./registryPersistence";

export const USER_STORAGE_KEY = "nbr.userRegistry.customUsers";
export const USER_EVENT = "nbr:users-updated";

function loadCustom(): RegistrySnapshot<SystemUser> {
  return loadRegistrySnapshot<SystemUser>(USER_STORAGE_KEY);
}

function saveCustom(snapshot: RegistrySnapshot<SystemUser>): void {
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(USER_EVENT));
  } catch { /* ignore */ }
}

export function useUserRegistry() {
  const [custom, setCustom] = useState<RegistrySnapshot<SystemUser>>(loadCustom);

  useEffect(() => {
    const sync = () => setCustom(loadCustom());
    window.addEventListener("storage", sync);
    window.addEventListener(USER_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(USER_EVENT, sync);
    };
  }, []);

  const users: SystemUser[] = mergeRegistry(MOCK_USERS, custom);

  const saveUser = useCallback((user: SystemUser) => {
    const updated = upsertRegistryRecord(loadCustom(), user);
    setCustom(updated);
    saveCustom(updated);
  }, []);

  const deleteUser = useCallback((id: string) => {
    const updated = deleteRegistryRecord(loadCustom(), id, MOCK_USERS);
    setCustom(updated);
    saveCustom(updated);
  }, []);

  const updateUserField = useCallback(
    (id: string, patch: Partial<SystemUser>) => {
      const snapshot = loadCustom();
      const all = mergeRegistry(MOCK_USERS, snapshot);
      const target = all.find((u) => u.id === id);
      if (!target) return;
      const updated_user = { ...target, ...patch };
      const updated = upsertRegistryRecord(snapshot, updated_user);
      setCustom(updated);
      saveCustom(updated);
    },
    []
  );

  return { users, saveUser, deleteUser, updateUserField };
}
