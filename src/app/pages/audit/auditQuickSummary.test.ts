import { describe, expect, it } from "vitest";
import en from "../../locales/en/audit.json";
import bn from "../../locales/bn/audit.json";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { getAuditCandidates } from "./auditCandidateStore";
import { buildAuditQuickSummary, QUICK_SUMMARY_MAX_CHARACTERS } from "./auditQuickSummary";

function translator(dictionary: typeof en) {
  return (key: string, values?: Record<string, unknown>) => {
    const text = key.split(".").reduce<unknown>((node, segment) =>
      node && typeof node === "object" ? (node as Record<string, unknown>)[segment] : undefined,
    dictionary) as string | undefined;
    if (typeof text !== "string") throw new Error("Missing translation " + key);
    return text.replace(/{{\s*(\w+)\s*}}/g, (_, token: string) => String(values?.[token] ?? ""));
  };
}

describe("candidate Quick summary source and length controls", () => {
  it.each([["en", en], ["bn", bn]] as const)(
    "uses existing source fields, no invented findings and at most 350 chars in %s",
    (language, dictionary) => {
      const t = translator(dictionary as typeof en);
      for (const candidate of getAuditCandidates()) {
        const source = ALL_TAXPAYER_ROWS.find((row) => String(row.return_id) === candidate.return_id);
        const summary = buildAuditQuickSummary(candidate, source, t, language);
        expect(Array.from(summary).length, candidate.candidate_id).toBeLessThanOrEqual(QUICK_SUMMARY_MAX_CHARACTERS);
        expect(summary).toContain(candidate.assessment_year);
        expect(summary).toContain(candidate.taxpayer_name);
        expect(summary).not.toContain("undefined");
        expect(summary).not.toContain("NaN");
      }
    },
  );

  it("Rahman synopsis cites both exact source risk signals, assessment year and sample gap", () => {
    const candidate = getAuditCandidates().find((item) => item.taxpayer_name === "Rahman Enterprise")!;
    const source = ALL_TAXPAYER_ROWS.find((row) => row.return_id === candidate.return_id)!;
    const summary = buildAuditQuickSummary(candidate, source, translator(en), "en");
    expect(summary).toContain("R-C1");
    expect(summary).toContain("R-E2");
    expect(summary).toContain("2025-26");
    expect(summary).toContain("737,872");
    expect(summary).toContain("not assessed tax");
    expect(summary).toContain("no confirmed finding");
  });

  it("does not infer a positive amount, new signal, or finding from incomplete data", () => {
    const seeded = getAuditCandidates()[0];
    const candidate = { ...seeded, signals: "—", data_quality: "Incomplete", risk_level: "Not determined" };
    const source = { ...ALL_TAXPAYER_ROWS.find((row) => row.return_id === candidate.return_id), mismatch_amount: 0 };
    const summary = buildAuditQuickSummary(candidate, source, translator(en), "en");
    expect(summary).toContain("No substantive risk signal");
    expect(summary).not.toContain("fund-flow difference");
    expect(summary).toContain("no confirmed finding");
  });
});
