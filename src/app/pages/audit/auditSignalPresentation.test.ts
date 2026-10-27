import { describe, expect, it } from "vitest";
import {
  AUDIT_SIGNAL_IDS,
  auditSignalQuestion,
  auditSignalCheck,
  auditSignalReason,
  auditSignalDocuments,
  auditSignalText,
} from "./auditSignalPresentation";
import { resolveAuditExplanation } from "./auditKnowledge";

describe("Audit decision UI uses source-based plain language", () => {
  it("has one readable English/Bangla question, comparison, reason and document request for each A–E signal", () => {
    expect(AUDIT_SIGNAL_IDS).toHaveLength(15);
    expect(new Set(AUDIT_SIGNAL_IDS).size).toBe(15);
    for (const id of AUDIT_SIGNAL_IDS) {
      for (const fn of [auditSignalQuestion, auditSignalCheck, auditSignalReason, auditSignalDocuments]) {
        const en = fn(id, "en") ?? "";
        const bn = fn(id, "bn-BD") ?? "";
        expect(en.length, id + " English").toBeGreaterThan(15);
        expect(bn.length, id + " Bengali").toBeGreaterThan(15);
        expect(en, id).not.toBe(bn);
        expect(bn, id).toMatch(/[\u0980-\u09ff]/);
        expect(en + bn).not.toMatch(/reference only|framework.only|prototype|demo|shadow.only/i);
      }
    }
  });

  it("shows the actual question once per signal, separately from the officer's next action", () => {
    for (const id of AUDIT_SIGNAL_IDS) {
      for (const locale of ["en", "bn-BD"]) {
        const outcome = resolveAuditExplanation(
          "signals", id,
          { return_id: "RET-TEST-01", assessment_year: "2025-26", data_quality: "Complete" },
          locale
        );
        expect(outcome, `${id} ${locale} missing explanation`).not.toBeNull();
        expect(outcome?.definition).toBe(auditSignalQuestion(id, locale));
        expect(outcome?.nextStep?.length ?? 0).toBeGreaterThan(20);
        expect(outcome?.signalContext?.scope).toBe("taxpayer");
      }
    }
  });

  it("keeps IT-10B reconciliation separate from dashboard source-of-funds difference", () => {
    const check = auditSignalCheck("R-C1", "en")!;
    expect(check).toContain("line 10");
    expect(check).toContain("line 7");
    expect(check).toContain("Do not substitute");
    expect(check).not.toMatch(/200,000|10%|3M/);
  });

  it("requires lawful access and taxpayer matching for the asset registry", () => {
    const check = auditSignalCheck("R-E2", "en")!;
    expect(check).toContain("lawful access");
    expect(check).toContain("ownership share");
    expect(check).toContain("record date");
  });

  it("retains missing-data, no-unapproved-threshold and individual-versus-group safeguards", () => {
    expect(auditSignalText("missing","en")).toContain("Never treat a missing amount as zero");
    expect(auditSignalText("noAuthority","en")).toContain("approved rule");
    expect(auditSignalText("groupDetail","en")).toContain("not one taxpayer");
    expect(auditSignalText("c1Threshold","bn")).toMatch(/অনুমোদিত/);
    expect(auditSignalQuestion("R-Z99","en")).toBeNull();
  });
});
