import type { TableRow } from "../modulePageUtils";
import { getAuditCandidates, type AuditCandidateRecord } from "./auditCandidateStore";

type EvidenceCandidate = Pick<
  AuditCandidateRecord,
  "candidate_id" | "tin" | "return_id" | "taxpayer_name" | "assessment_year" | "signals"
>;

export type CandidateEvidenceTrend = {
  key: string;
  labelKey: string;
  years: string[];
  values: number[];
  relatedSignals: string[];
};

type EvidenceMetric = Omit<CandidateEvidenceTrend, "years">;

function signalIds(value: unknown): string[] {
  return Array.from(new Set(String(value ?? "").match(/R-[A-E]\d/g) ?? []));
}

function assessmentYearHistory(year: string): string[] {
  const match = year.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ["2023-24", "2024-25", year];

  const start = Number(match[1]);
  return [start - 2, start - 1, start].map((value) => {
    const next = String((value + 1) % 100).padStart(2, "0");
    return String(value) + "-" + next;
  });
}

function candidateSeed(candidate: EvidenceCandidate): number {
  const raw =
    candidate.candidate_id +
    candidate.tin +
    candidate.return_id +
    candidate.taxpayer_name;

  return raw.split("").reduce((sum, char, index) => {
    return (sum + char.charCodeAt(0) * (index + 3)) % 9973;
  }, 0);
}

function series(current: number, seed: number, offset = 0): number[] {
  const currentGrowth = 1.07 + ((seed + offset) % 8) / 100;
  const priorGrowth = 1.05 + ((seed + offset * 3) % 7) / 100;
  const middle = Math.round(current / currentGrowth);
  const oldest = Math.round(middle / priorGrowth);
  return [oldest, middle, Math.round(current)];
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function candidateFromRow(row: TableRow): EvidenceCandidate {
  const returnId = String(row.return_id ?? "—");
  const tin = String(row.tin ?? "—");
  const year = String(row.assessment_year ?? "").trim();
  // Never borrow financial evidence from a different assessment year or
  // another return sharing a partial/masked taxpayer identifier.
  const stored = getAuditCandidates().find(
    (candidate) => candidate.return_id === returnId
      && candidate.assessment_year === year,
  );

  if (stored) return stored;

  return {
    candidate_id: String(row.id ?? returnId),
    tin,
    return_id: returnId,
    taxpayer_name: String(row.taxpayer_name ?? "—"),
    assessment_year: String(row.assessment_year ?? "2025-26"),
    signals: String(row.signals ?? "—"),
  };
}

/**
 * Keeps the existing prototype comparison internally consistent. These configured
 * percentages belong only to the synthetic illustration, never to NBR law or an
 * executable R-C1/IT-10B trigger.
 */
export function reconcileGeneratedFundFlow(
  sourceOfFund: readonly number[],
  startingOutflow: readonly number[],
  signalIds: readonly string[],
): { sourceOfFund: number[]; fundOutflow: number[]; difference: number[] } {
  if (sourceOfFund.length !== 3 || startingOutflow.length !== 3 ||
      ![...sourceOfFund, ...startingOutflow].every(Number.isFinite)) {
    throw new Error("Three complete numeric years are required for a funds-flow illustration");
  }
  const fundOutflow = [...startingOutflow];
  if (signalIds.includes("R-C1")) {
    fundOutflow[2] = sourceOfFund[2] + Math.round(Math.max(sourceOfFund[2], 1) * 0.24);
  }
  if (signalIds.includes("R-C2")) {
    for (const [year, factor] of [0.08, 0.14, 0.2].entries()) {
      fundOutflow[year] = sourceOfFund[year] + Math.round(Math.max(sourceOfFund[year], 1) * factor);
    }
  }
  return {
    sourceOfFund: [...sourceOfFund],
    fundOutflow,
    difference: sourceOfFund.map((value, index) => value - fundOutflow[index]),
  };
}

function buildEvidenceMetrics(candidate: EvidenceCandidate): EvidenceMetric[] {
  const seed = candidateSeed(candidate);
  const signals = signalIds(candidate.signals);

  const zeroIncomeCurrent =
    signals.includes("R-A1") || signals.includes("R-D1");

  const employmentCurrent =
    seed % 3 === 0 ? 0 : 360000 + (seed % 16) * 42000;
  const rentalCurrent =
    seed % 4 === 0 ? 0 : 180000 + (seed % 13) * 36000;
  const agricultureCurrent =
    seed % 5 === 0 ? 0 : 240000 + (seed % 11) * 62000;
  const businessCurrent =
    seed % 2 === 0 ? 620000 + (seed % 19) * 74000 : 0;
  const financialCurrent = 22000 + (seed % 17) * 8500;

  const employment = series(employmentCurrent, seed, 1);
  const rental = series(rentalCurrent, seed, 2);
  const agriculture = series(agricultureCurrent, seed, 3);
  const business = series(businessCurrent, seed, 4);
  const financial = series(financialCurrent, seed, 5);

  if (zeroIncomeCurrent) {
    employment[2] = 0;
    rental[2] = 0;
    agriculture[2] = 0;
    business[2] = 0;
    financial[2] = 0;
  }

  if (signals.includes("R-B2")) {
    employment[2] = Math.round(employment[1] * 0.82);
    rental[2] = Math.round(rental[1] * 0.9);
    agriculture[2] = Math.round(agriculture[1] * 0.85);
    business[2] = Math.round(business[1] * 0.78);
    financial[2] = Math.round(financial[1] * 0.92);
  }

  const totalIncome = [0, 1, 2].map(
    (index) =>
      employment[index] +
      rental[index] +
      agriculture[index] +
      business[index] +
      financial[index],
  );

  const grossTax = totalIncome.map((value, index) =>
    Math.round(value * (0.16 + ((seed + index) % 4) / 100)),
  );
  const taxPayable = grossTax.map((value) => Math.round(value * 0.88));
  const tds = taxPayable.map((value) => Math.round(value * 0.22));
  const exemptIncome = totalIncome.map((value) => Math.round(value * 0.035));

  if (signals.includes("R-A2")) {
    taxPayable[2] = 0;
  }

  if (signals.includes("R-A3")) {
    tds[2] = Math.max(tds[2], Math.round(totalIncome[2] * 0.19));
  }

  if (signals.includes("R-D1")) {
    taxPayable[2] = 0;
    tds[2] = 0;
  }

  const lifestyle = totalIncome.map((value, index) =>
    Math.round(value * (0.31 + ((seed + index) % 7) / 100)),
  );

  if (signals.includes("R-C4")) {
    lifestyle[2] = Math.round(totalIncome[2] * 0.08);
  }

  const netWealth = series(
    2800000 + (seed % 31) * 145000,
    seed,
    6,
  );
  const liabilities = series(
    280000 + (seed % 13) * 52000,
    seed,
    7,
  );

  if (signals.includes("R-B1") || signals.includes("R-E2")) {
    netWealth[2] = Math.round(netWealth[1] * 1.72);
  }
  if (signals.includes("R-B2")) {
    netWealth[2] = Math.round(netWealth[1] * 1.58);
  }

  const sourceOfFund = totalIncome.map(
    (value, index) => value + exemptIncome[index],
  );
  const fundOutflow = lifestyle.map(
    (value, index) =>
      value +
      Math.max(
        0,
        netWealth[index] -
          (index > 0
            ? netWealth[index - 1]
            : Math.round(netWealth[index] * 0.9)),
      ),
  );
  const { difference } = reconcileGeneratedFundFlow(sourceOfFund, fundOutflow, signals);

  const openingNetWealth = [
    Math.round(netWealth[0] * 0.9),
    netWealth[0],
    netWealth[1],
  ];

  if (signals.includes("R-C3")) {
    openingNetWealth[2] = Math.round(netWealth[1] * 0.66);
  }

  const businessTurnover = business.map((value) =>
    value > 0 ? Math.round(value * (7.2 + (seed % 4) * 0.6)) : 0,
  );

  if (signals.includes("R-E3") && businessTurnover[1] > 0) {
    businessTurnover[2] = Math.round(businessTurnover[1] * 1.85);
  }

  return [
    {
      key: "employmentIncome",
      labelKey: "candidates.detail.metrics.employmentIncome",
      values: employment,
      relatedSignals: ["R-E1", "R-D1", "R-B2"],
    },
    {
      key: "totalIncome",
      labelKey: "candidates.detail.metrics.totalIncome",
      values: totalIncome,
      relatedSignals: ["R-A1", "R-A2", "R-A3", "R-B2", "R-D1", "R-D2"],
    },
    {
      key: "taxPayable",
      labelKey: "candidates.detail.metrics.taxPayable",
      values: taxPayable,
      relatedSignals: ["R-A2", "R-D1"],
    },
    {
      key: "tds",
      labelKey: "candidates.detail.metrics.tds",
      values: tds,
      relatedSignals: ["R-A3"],
    },
    {
      key: "netWealth",
      labelKey: "candidates.detail.metrics.netWealth",
      values: netWealth,
      relatedSignals: ["R-A1", "R-B1", "R-B2", "R-E2"],
    },
    {
      key: "openingNetWealth",
      labelKey: "candidates.detail.metrics.openingNetWealth",
      values: openingNetWealth,
      relatedSignals: ["R-C3"],
    },
    {
      key: "lifestyleExpense",
      labelKey: "candidates.detail.metrics.lifestyleExpense",
      values: lifestyle,
      relatedSignals: ["R-C4"],
    },
    {
      key: "difference",
      labelKey: "candidates.detail.metrics.difference",
      values: difference,
      relatedSignals: ["R-C1", "R-C2"],
    },
    {
      key: "businessTurnover",
      labelKey: "candidates.detail.metrics.businessTurnover",
      values: businessTurnover,
      relatedSignals: ["R-E3"],
    },
  ];
}

export function buildCandidateEvidenceTrend(row: TableRow): CandidateEvidenceTrend | null {
  const candidate = candidateFromRow(row);
  const signals = signalIds(candidate.signals);
  const metrics = buildEvidenceMetrics(candidate);
  const linked = metrics.filter((metric) =>
    signals.some((signal) => metric.relatedSignals.includes(signal)),
  );

  if (linked.length === 0) return null;

  const selected =
    linked.find((metric) => metric.key === "difference" && metric.values[2] < 0) ??
    [...linked].sort((a, b) => {
      const aChange = Math.abs(changePercent(a.values[2], a.values[1]) ?? 0);
      const bChange = Math.abs(changePercent(b.values[2], b.values[1]) ?? 0);
      return bChange - aChange;
    })[0];

  return {
    ...selected,
    years: assessmentYearHistory(candidate.assessment_year),
  };
}
