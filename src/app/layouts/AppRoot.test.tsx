import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppRoot } from "./AppRoot";

const shared = vi.hoisted(() => ({
  enabled: false,
  checkAccess: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
vi.mock("../pages/audit/auditSharedSql", () => ({
  isSharedAuditMode: () => shared.enabled,
  checkAuditSqlAccess: (...args: unknown[]) => shared.checkAccess(...args),
  getAuditSqlClient: () => ({
    auth: {
      signOut: (...args: unknown[]) => shared.signOut(...args),
      onAuthStateChange: (...args: unknown[]) => shared.onAuthStateChange(...args),
    },
  }),
}));
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }));
vi.mock("../hooks/useAppearance", () => ({ useAppearance: () => undefined }));
vi.mock("../context/HelpContext", () => ({
  HelpProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../components/help/HelpDrawer", () => ({ HelpDrawer: () => null }));
vi.mock("./AppShell", () => ({
  AppShell: ({ onSignedOut }: { onSignedOut: () => void }) =>
    <main data-testid="office-demo-shell"><button onClick={onSignedOut}>Sign out</button></main>,
}));
vi.mock("../pages/auth/LoginPage", () => ({
  LoginPage: ({ onOfficeEnter }: { onOfficeEnter: () => void }) =>
    <button onClick={onOfficeEnter}>Enter Office (admin)</button>,
}));

describe("Office UI entry and shared officer Auth lifecycle", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    shared.enabled = false;
    shared.checkAccess.mockResolvedValue({ userId: "verified-test-officer" });
    shared.signOut.mockResolvedValue({ error: null });
    shared.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("preserves demo-only admin entry and logout without Supabase access", async () => {
    const user = userEvent.setup();
    render(<AppRoot />);
    expect(screen.getByRole("button", { name: "Enter Office (admin)" })).toBeInTheDocument();
    expect(screen.queryByTestId("office-demo-shell")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enter Office (admin)" }));
    expect(screen.getByTestId("office-demo-shell")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("office_ui_entered")).toBe("admin");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByTestId("office-demo-shell")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("office_ui_entered")).toBeNull();
    expect(shared.signOut).not.toHaveBeenCalled();
  });

  it("does not restore a prototype admin marker in shared mode", async () => {
    shared.enabled = true;
    window.sessionStorage.setItem("office_ui_entered", "admin");
    render(<AppRoot />);
    expect(screen.queryByTestId("office-demo-shell")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter Office (admin)" })).toBeInTheDocument();
    expect(shared.checkAccess).not.toHaveBeenCalled();
  });

  it("revalidates an officer marker before restoring the shared shell", async () => {
    shared.enabled = true;
    window.sessionStorage.setItem("office_ui_entered", "officer");
    const renderResult = render(<AppRoot />);
    expect(screen.queryByTestId("office-demo-shell")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Verifying Audit officer access");
    await waitFor(() => expect(screen.getByTestId("office-demo-shell")).toBeInTheDocument());
    expect(shared.checkAccess).toHaveBeenCalledOnce();
    renderResult.unmount();
    expect(shared.onAuthStateChange.mock.results[0].value.data.subscription.unsubscribe)
      .toHaveBeenCalledOnce();
  });

  it("denies an officer marker with revoked or missing membership", async () => {
    shared.enabled = true;
    window.sessionStorage.setItem("office_ui_entered", "officer");
    shared.checkAccess.mockRejectedValue(new Error("not a member"));
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter Office (admin)" }))
      .toBeInTheDocument());
    expect(screen.queryByTestId("office-demo-shell")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("office_ui_entered")).toBeNull();
    expect(shared.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs out the actual Auth session before clearing shared entry", async () => {
    shared.enabled = true;
    const user = userEvent.setup();
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: "Enter Office (admin)" }));
    expect(window.sessionStorage.getItem("office_ui_entered")).toBe("officer");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(shared.signOut).toHaveBeenCalledWith({ scope: "local" }));
    await waitFor(() => expect(screen.queryByTestId("office-demo-shell")).not.toBeInTheDocument());
    expect(window.sessionStorage.getItem("office_ui_entered")).toBeNull();
  });

  it("does not misreport a failed shared Auth sign-out as successful", async () => {
    shared.enabled = true;
    shared.signOut.mockResolvedValue({ error: new Error("network issue") });
    const user = userEvent.setup();
    render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: "Enter Office (admin)" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be verified");
    expect(screen.getByTestId("office-demo-shell")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("office_ui_entered")).toBe("officer");
  });
});
