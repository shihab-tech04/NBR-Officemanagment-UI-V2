import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_ROLES, MOCK_USERS } from "../../data/mockData";
import {
  deleteRegistryRecord, loadRegistrySnapshot, mergeRegistry, upsertRegistryRecord,
} from "../registryPersistence";
import { useUserRegistry, USER_STORAGE_KEY } from "../useUserRegistry";
import { useRoleRegistry, ROLE_STORAGE_KEY } from "../useRoleRegistry";

beforeEach(() => window.localStorage.clear());

describe("versioned browser-only registry persistence", () => {
  it("reads legacy array records without deleting seeded defaults", () => {
    const override = { ...MOCK_USERS[0], name: "Existing custom name" };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify([override]));
    const snapshot = loadRegistrySnapshot<typeof override>(USER_STORAGE_KEY);
    expect(snapshot.deletedIds).toEqual([]);
    expect(mergeRegistry(MOCK_USERS, snapshot).find(user => user.id === override.id)?.name).toBe("Existing custom name");
  });

  it("does not crash on invalid browser storage", () => {
    localStorage.setItem(USER_STORAGE_KEY, "not json");
    expect(loadRegistrySnapshot(USER_STORAGE_KEY)).toEqual({ records: [], deletedIds: [] });
  });

  it("deletes a built-in fixture without resurrection and permits explicit recreation", () => {
    const fixture = MOCK_USERS[0];
    const deleted = deleteRegistryRecord({ records: [], deletedIds: [] }, fixture.id, MOCK_USERS);
    expect(deleted.deletedIds).toEqual([fixture.id]);
    expect(mergeRegistry(MOCK_USERS, deleted).some(user => user.id === fixture.id)).toBe(false);
    const restored = upsertRegistryRecord(deleted, fixture);
    expect(restored.deletedIds).toEqual([]);
    expect(mergeRegistry(MOCK_USERS, restored).some(user => user.id === fixture.id)).toBe(true);
  });

  it("removes custom records without leaving obsolete tombstones", () => {
    const record = { ...MOCK_USERS[0], id: "added-user" };
    const snapshot = upsertRegistryRecord({ records: [], deletedIds: [] }, record);
    expect(mergeRegistry(MOCK_USERS, snapshot)[0].id).toBe(record.id);
    const deleted = deleteRegistryRecord(snapshot, record.id, MOCK_USERS);
    expect(deleted).toEqual({ records: [], deletedIds: [] });
    expect(mergeRegistry(MOCK_USERS, deleted).some(user => user.id === record.id)).toBe(false);
  });

  it("keeps deleted base users deleted through a remount and can restore them", () => {
    const id = MOCK_USERS[0].id;
    const first = renderHook(() => useUserRegistry());
    act(() => first.result.current.deleteUser(id));
    expect(first.result.current.users.some(user => user.id === id)).toBe(false);
    first.unmount();

    const second = renderHook(() => useUserRegistry());
    expect(second.result.current.users.some(user => user.id === id)).toBe(false);
    act(() => second.result.current.saveUser(MOCK_USERS[0]));
    expect(second.result.current.users.some(user => user.id === id)).toBe(true);
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)!).deletedIds).toEqual([]);
  });

  it("keeps deleted base roles deleted through permission registry synchronization", () => {
    const id = MOCK_ROLES[0].id;
    const roleHook = renderHook(() => useRoleRegistry());
    act(() => roleHook.result.current.deleteRole(id));
    expect(roleHook.result.current.roles.some(role => role.id === id)).toBe(false);
    act(() => window.dispatchEvent(new CustomEvent("nbr:permission-deleted", { detail: { id: "missing-permission" } })));
    expect(roleHook.result.current.roles.some(role => role.id === id)).toBe(false);
    roleHook.unmount();
    const reloaded = renderHook(() => useRoleRegistry());
    expect(reloaded.result.current.roles.some(role => role.id === id)).toBe(false);
    expect(JSON.parse(localStorage.getItem(ROLE_STORAGE_KEY)!).deletedIds).toContain(id);
  });

  it("keeps a legacy customized role after a permission deletion event", () => {
    const role = { ...MOCK_ROLES[0], name: "Edited role" };
    localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify([role]));
    const hook = renderHook(() => useRoleRegistry());
    expect(hook.result.current.roles.find(item => item.id === role.id)?.name).toBe("Edited role");
    act(() => window.dispatchEvent(new CustomEvent("nbr:permission-deleted", { detail: { id: "missing-permission" } })));
    expect(hook.result.current.roles.find(item => item.id === role.id)?.name).toBe("Edited role");
    hook.unmount();
    const reopened = renderHook(() => useRoleRegistry());
    expect(reopened.result.current.roles.find(item => item.id === role.id)?.name).toBe("Edited role");
  });
});
