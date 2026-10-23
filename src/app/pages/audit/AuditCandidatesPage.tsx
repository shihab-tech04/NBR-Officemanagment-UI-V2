import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  Filter,
  Info,
  Plus,
  Printer,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { StatusBadge } from "../../components/badges/StatusBadge";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { FilterPanel } from "../../components/filters/FilterPanel";
import { MobileFilterOverlay } from "../../components/filters/MobileFilterOverlay";
import { AppliedFilterChips } from "../../components/filters/AppliedFilterChips";
import { MobileSearchFilter } from "../../components/shared/MobileSearchFilter";
import { Pagination } from "../../components/shared/Pagination";
import { useUIState } from "../../hooks/useUI";
import { handleExportDisabled } from "../../utils/exportDisabled";
import type { ColDef, FilterDef, TableRow } from "../modulePageUtils";
import { fc } from "../modulePageUtils";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import {
  getAuditCandidates,
  type AuditCandidateRecord,
} from "./auditCandidateStore";
import { AuditExplainerDrawer } from "./AuditExplainerDrawer";
import { resolveAuditExplanation, type AuditExplanation } from "./auditKnowledge";
import { InitiateAuditModal } from "./InitiateAuditPage";
import { ResponsiveOverlay } from "../../components/shared/ResponsiveOverlay";

const PER_PAGE = 10;
const AUDIT_DROPDOWN_SEARCH_THRESHOLD = 5;

type ComparisonMetric = {
  key: string;
  labelKey: string;
  values: number[];
  relatedSignals: string[];
};

type ComparisonSection = {
  key: string;
  titleKey: string;
  metrics: ComparisonMetric[];
};

const SIGNAL_LABEL_KEYS: Record<string, string> = {
  "R-A1": "candidates.detail.signalLabels.R-A1",
  "R-A2": "candidates.detail.signalLabels.R-A2",
  "R-A3": "candidates.detail.signalLabels.R-A3",
  "R-B1": "candidates.detail.signalLabels.R-B1",
  "R-B2": "candidates.detail.signalLabels.R-B2",
  "R-C1": "candidates.detail.signalLabels.R-C1",
  "R-C2": "candidates.detail.signalLabels.R-C2",
  "R-C3": "candidates.detail.signalLabels.R-C3",
  "R-C4": "candidates.detail.signalLabels.R-C4",
  "R-D1": "candidates.detail.signalLabels.R-D1",
  "R-D2": "candidates.detail.signalLabels.R-D2",
  "R-D3": "candidates.detail.signalLabels.R-D3",
  "R-E1": "candidates.detail.signalLabels.R-E1",
  "R-E2": "candidates.detail.signalLabels.R-E2",
  "R-E3": "candidates.detail.signalLabels.R-E3",
};

const SIGNAL_AUDIT_ACTION_KEYS: Record<string, string> = {
  "R-A1": "candidates.detail.auditNote.actions.R-A1",
  "R-A2": "candidates.detail.auditNote.actions.R-A2",
  "R-A3": "candidates.detail.auditNote.actions.R-A3",
  "R-B1": "candidates.detail.auditNote.actions.R-B1",
  "R-B2": "candidates.detail.auditNote.actions.R-B2",
  "R-C1": "candidates.detail.auditNote.actions.R-C1",
  "R-C2": "candidates.detail.auditNote.actions.R-C2",
  "R-C3": "candidates.detail.auditNote.actions.R-C3",
  "R-C4": "candidates.detail.auditNote.actions.R-C4",
  "R-D1": "candidates.detail.auditNote.actions.R-D1",
  "R-D2": "candidates.detail.auditNote.actions.R-D2",
  "R-D3": "candidates.detail.auditNote.actions.R-D3",
  "R-E1": "candidates.detail.auditNote.actions.R-E1",
  "R-E2": "candidates.detail.auditNote.actions.R-E2",
  "R-E3": "candidates.detail.auditNote.actions.R-E3",
};

function unique(rows: TableRow[], field: string): string[] {
  return Array.from(
    new Set(rows.map((row) => String(row[field] ?? "")).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

function signalIds(value: unknown): string[] {
  return Array.from(new Set(String(value ?? "").match(/R-[A-E]\d/g) ?? []));
}

function controlFlagIds(value: unknown): string[] {
  return Array.from(new Set(String(value ?? "").match(/F[0-5]/g) ?? []));
}

function getSourceTaxpayer(candidate: AuditCandidateRecord): TableRow | undefined {
  return ALL_TAXPAYER_ROWS.find(
    (row) =>
      String(row.return_id ?? "") === candidate.return_id ||
      String(row.tin ?? "") === candidate.tin,
  );
}

function getCandidateReason(
  candidate: AuditCandidateRecord,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const basis = candidate.selection_basis.toLowerCase();
  const source = getSourceTaxpayer(candidate);

  if (basis.startsWith("risk-based")) {
    return String(
      source?.reason_code ??
        candidate.selection_basis ??
        t("candidates.detail.reasonFallback"),
    );
  }

  if (basis.startsWith("control")) {
    const flags = controlFlagIds(candidate.control_flags);
    return flags.length
      ? t("candidates.detail.controlReason", { flags: flags.join(", ") })
      : String(source?.reason_code ?? candidate.selection_basis);
  }

  if (basis.startsWith("manual")) {
    return t("candidates.detail.manualReason");
  }

  if (basis.startsWith("population")) {
    return t("candidates.detail.populationReason");
  }

  return String(
    source?.reason_code ??
      candidate.selection_basis ??
      t("candidates.detail.reasonFallback"),
  );
}

function groupBatches(rows: AuditCandidateRecord[]): TableRow[] {
  const batches = new Map<string, AuditCandidateRecord[]>();

  rows.forEach((row) => {
    const list = batches.get(row.batch_id) ?? [];
    list.push(row);
    batches.set(row.batch_id, list);
  });

  return Array.from(batches.entries())
    .map(([batchId, candidates]) => {
      const sample = candidates[0];
      return {
        batch_id: batchId,
        assessment_year: sample.assessment_year,
        selection_track: sample.selection_track,
        candidate_count: candidates.length,
        population_considered: sample.population_considered,
        eligible_after_readiness: sample.eligible_after_readiness,
        matched_criteria: sample.matched_criteria,
        funnel_rule: sample.funnel_rule,
        selected_on: sample.selected_on,
        selection_basis: sample.selection_basis,
      };
    })
    .sort((a, b) => {
      const dateCompare = String(b.selected_on ?? "").localeCompare(
        String(a.selected_on ?? ""),
      );
      if (dateCompare !== 0) return dateCompare;
      return String(b.batch_id ?? "").localeCompare(String(a.batch_id ?? ""));
    });
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

function candidateSeed(candidate: AuditCandidateRecord): number {
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

function buildComparison(candidate: AuditCandidateRecord): ComparisonSection[] {
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
  const advanceTax = taxPayable.map((value) => Math.round(value * 0.12));
  const exemptIncome = totalIncome.map((value) => Math.round(value * 0.035));
  const totalTaxPaid = taxPayable.map((value, index) =>
    Math.min(value, tds[index] + advanceTax[index] + Math.round(value * 0.58)),
  );

  if (signals.includes("R-A2")) {
    taxPayable[2] = 0;
    totalTaxPaid[2] = tds[2];
  }

  if (signals.includes("R-A3")) {
    tds[2] = Math.max(tds[2], Math.round(totalIncome[2] * 0.19));
  }

  if (signals.includes("R-D1")) {
    grossTax[2] = 0;
    taxPayable[2] = 0;
    tds[2] = 0;
    advanceTax[2] = 0;
    totalTaxPaid[2] = 0;
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

  const grossWealth = netWealth.map(
    (value, index) => value + liabilities[index],
  );
  const sourceOfFund = totalIncome.map(
    (value, index) => value + exemptIncome[index],
  );
  const fundOutflow = lifestyle.map(
    (value, index) =>
      value + Math.max(0, netWealth[index] - (index > 0 ? netWealth[index - 1] : Math.round(netWealth[index] * 0.9))),
  );
  const difference = sourceOfFund.map(
    (value, index) => value - fundOutflow[index],
  );

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
  const businessNetProfit = [...business];

  if (signals.includes("R-E3") && businessTurnover[1] > 0) {
    businessTurnover[2] = Math.round(businessTurnover[1] * 1.85);
  }

  const annualRent = rental.map((value) =>
    value > 0 ? Math.round(value * 2.3) : 0,
  );
  const allowableRentalDeduction = annualRent.map((value) =>
    Math.round(value * 0.32),
  );

  const metrics: ComparisonSection[] = [
    {
      key: "income",
      titleKey: "candidates.detail.sections.income",
      metrics: [
        {
          key: "employmentIncome",
          labelKey: "candidates.detail.metrics.employmentIncome",
          values: employment,
          relatedSignals: ["R-E1", "R-D1", "R-B2"],
        },
        {
          key: "rentalIncome",
          labelKey: "candidates.detail.metrics.rentalIncome",
          values: rental,
          relatedSignals: ["R-B2", "R-D1"],
        },
        {
          key: "agricultureIncome",
          labelKey: "candidates.detail.metrics.agricultureIncome",
          values: agriculture,
          relatedSignals: ["R-B2", "R-D1"],
        },
        {
          key: "businessIncome",
          labelKey: "candidates.detail.metrics.businessIncome",
          values: business,
          relatedSignals: ["R-B2", "R-D1", "R-E3"],
        },
        {
          key: "financialAssetIncome",
          labelKey: "candidates.detail.metrics.financialAssetIncome",
          values: financial,
          relatedSignals: ["R-B2", "R-D1"],
        },
        {
          key: "totalIncome",
          labelKey: "candidates.detail.metrics.totalIncome",
          values: totalIncome,
          relatedSignals: ["R-A1", "R-A2", "R-A3", "R-B2", "R-D1", "R-D2"],
        },
      ],
    },
    {
      key: "tax",
      titleKey: "candidates.detail.sections.tax",
      metrics: [
        {
          key: "grossTax",
          labelKey: "candidates.detail.metrics.grossTax",
          values: grossTax,
          relatedSignals: ["R-A2", "R-D1"],
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
          key: "advanceTax",
          labelKey: "candidates.detail.metrics.advanceTax",
          values: advanceTax,
          relatedSignals: [],
        },
        {
          key: "totalTaxPaid",
          labelKey: "candidates.detail.metrics.totalTaxPaid",
          values: totalTaxPaid,
          relatedSignals: ["R-A2", "R-D1"],
        },
        {
          key: "exemptIncome",
          labelKey: "candidates.detail.metrics.exemptIncome",
          values: exemptIncome,
          relatedSignals: [],
        },
      ],
    },
    {
      key: "wealth",
      titleKey: "candidates.detail.sections.wealth",
      metrics: [
        {
          key: "sourceOfFund",
          labelKey: "candidates.detail.metrics.sourceOfFund",
          values: sourceOfFund,
          relatedSignals: ["R-C1", "R-C2"],
        },
        {
          key: "openingNetWealth",
          labelKey: "candidates.detail.metrics.openingNetWealth",
          values: openingNetWealth,
          relatedSignals: ["R-C3"],
        },
        {
          key: "netWealth",
          labelKey: "candidates.detail.metrics.netWealth",
          values: netWealth,
          relatedSignals: ["R-A1", "R-B1", "R-B2", "R-E2"],
        },
        {
          key: "grossWealth",
          labelKey: "candidates.detail.metrics.grossWealth",
          values: grossWealth,
          relatedSignals: ["R-B1", "R-B2", "R-E2"],
        },
        {
          key: "liabilities",
          labelKey: "candidates.detail.metrics.liabilities",
          values: liabilities,
          relatedSignals: [],
        },
        {
          key: "lifestyleExpense",
          labelKey: "candidates.detail.metrics.lifestyleExpense",
          values: lifestyle,
          relatedSignals: ["R-C4"],
        },
        {
          key: "fundOutflow",
          labelKey: "candidates.detail.metrics.fundOutflow",
          values: fundOutflow,
          relatedSignals: ["R-C1", "R-C2"],
        },
        {
          key: "difference",
          labelKey: "candidates.detail.metrics.difference",
          values: difference,
          relatedSignals: ["R-C1", "R-C2"],
        },
      ],
    },
    {
      key: "business",
      titleKey: "candidates.detail.sections.business",
      metrics: [
        {
          key: "businessTurnover",
          labelKey: "candidates.detail.metrics.businessTurnover",
          values: businessTurnover,
          relatedSignals: ["R-E3"],
        },
        {
          key: "businessNetProfit",
          labelKey: "candidates.detail.metrics.businessNetProfit",
          values: businessNetProfit,
          relatedSignals: ["R-E3", "R-B2"],
        },
      ],
    },
    {
      key: "property",
      titleKey: "candidates.detail.sections.property",
      metrics: [
        {
          key: "annualRent",
          labelKey: "candidates.detail.metrics.annualRent",
          values: annualRent,
          relatedSignals: [],
        },
        {
          key: "allowableRentalDeduction",
          labelKey: "candidates.detail.metrics.allowableRentalDeduction",
          values: allowableRentalDeduction,
          relatedSignals: [],
        },
        {
          key: "netRentalIncome",
          labelKey: "candidates.detail.metrics.netRentalIncome",
          values: rental,
          relatedSignals: ["R-B2"],
        },
      ],
    },
  ];

  return metrics;
}

function formatMoney(value: number, language: string): string {
  const locale = language?.startsWith("bn") ? "bn-BD" : "en-BD";
  return "৳" + new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function changePercent(current: number, previous: number): number | null {
  if (previous * current < 0) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatChange(value: number | null, language: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const locale = language?.startsWith("bn") ? "bn-BD" : "en-BD";
  const sign = value > 0 ? "+" : "";
  return (
    sign +
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(value) +
    "%"
  );
}

function formatCompactMoney(value: number, language: string): string {
  const locale = language?.startsWith("bn") ? "bn-BD" : "en-BD";
  return "৳" + new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

type SignalLinkedMetric = ComparisonMetric & {
  sectionTitle: string;
  label: string;
};

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const nice =
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 2.5 ? 2.5 :
    normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function trendAxis(values: number[]): { min: number; max: number; ticks: number[] } {
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const sameValue = minRaw === maxRaw;
  const baseSpan = sameValue ? Math.max(Math.abs(maxRaw) * 0.2, 1) : maxRaw - minRaw;
  const pad = Math.max(baseSpan * 0.18, Math.abs(maxRaw) * 0.025, 1);
  const allNonNegative = minRaw >= 0;
  const allNonPositive = maxRaw <= 0;

  let provisionalMin = minRaw - pad;
  let provisionalMax = maxRaw + pad;

  if (allNonNegative) provisionalMin = Math.max(0, provisionalMin);
  if (allNonPositive) provisionalMax = Math.min(0, provisionalMax);

  const step = niceStep(Math.max(1, provisionalMax - provisionalMin) / 4);
  let min = Math.floor(provisionalMin / step) * step;
  let max = Math.ceil(provisionalMax / step) * step;

  if (allNonNegative) min = Math.max(0, min);
  if (allNonPositive) max = Math.min(0, max);

  if (min === max) {
    min -= step;
    max += step;
    if (allNonNegative) min = Math.max(0, min);
    if (allNonPositive) max = Math.min(0, max);
  }

  const ticks: number[] = [];
  for (let value = min; value <= max + step * 0.25; value += step) {
    ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
    if (ticks.length > 6) break;
  }

  return { min, max, ticks };
}

function AuditTrendChart({
  metric,
  years,
  language,
  title,
  description,
  oneYearLabel,
  threeYearLabel,
}: {
  metric: SignalLinkedMetric;
  years: string[];
  language: string;
  title: string;
  description: string;
  oneYearLabel: string;
  threeYearLabel: string;
}) {
  const width = 720;
  const height = 210;
  const pad = { top: 28, right: 62, bottom: 42, left: 70 };
  const values = metric.values;
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const rawSpan = Math.max(1, maxRaw - minRaw);
  const step = niceStep(rawSpan / 3);
  const axisMin = Math.min(0, Math.floor(minRaw / step) * step) - (minRaw < 0 ? step * 0.35 : 0);
  const axisMax = Math.max(step, Math.ceil(maxRaw / step) * step) + step * 0.25;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (innerW * index) / Math.max(1, values.length - 1);
  const y = (value: number) =>
    pad.top + ((axisMax - value) / Math.max(1, axisMax - axisMin)) * innerH;
  const zeroY = y(0);
  const pointList = values.map((value, index) => [x(index), y(value)] as const);
  const path = pointList
    .map(([px, py], index) => `${index === 0 ? "M" : "L"} ${px} ${py}`)
    .join(" ");
  const areaPath = [
    `M ${pointList[0][0]} ${zeroY}`,
    ...pointList.map(([px, py]) => `L ${px} ${py}`),
    `L ${pointList[pointList.length - 1][0]} ${zeroY}`,
    "Z",
  ].join(" ");
  const oneYearChange = changePercent(values[2], values[1]);
  const threeYearChange = changePercent(values[2], values[0]);

  const ticks: number[] = [];
  for (let value = axisMin; value <= axisMax + step * 0.25; value += step) {
    ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
    if (ticks.length > 5) break;
  }

  const latestNegative = values[2] < 0;
  const signCrossing = (previous: number) => previous * values[2] < 0;
  const moneyDelta = (previous: number) => formatMoney(values[2] - previous, language);

  return (
    <div className="audit-chart audit-chart--trend audit-chart--trend-compact">
      <div className="audit-trend-summary">
        <div className="audit-trend-summary__current">
          <span>{years[2]}</span>
          <strong className={latestNegative ? "audit-trend-summary__value audit-trend-summary__value--negative" : "audit-trend-summary__value"}>
            {formatMoney(values[2], language)}
          </strong>
        </div>

        <div className="audit-trend-summary__changes">
          <span className={(oneYearChange ?? 0) < 0 ? "audit-trend-summary__change audit-trend-summary__change--negative" : "audit-trend-summary__change"}>
            <small>{oneYearLabel}</small>
            <strong>{signCrossing(values[1]) ? moneyDelta(values[1]) : formatChange(oneYearChange, language)}</strong>
          </span>
          <span className={(threeYearChange ?? 0) < 0 ? "audit-trend-summary__change audit-trend-summary__change--negative" : "audit-trend-summary__change"}>
            <small>{threeYearLabel}</small>
            <strong>{signCrossing(values[0]) ? moneyDelta(values[0]) : formatChange(threeYearChange, language)}</strong>
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}: ${metric.label}. ${description}`}
      >
        <title>{title}: {metric.label}</title>
        <desc>{description}</desc>

        <defs>
          <linearGradient id={`audit-trend-fill-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="audit-trend-area__stop audit-trend-area__stop--top" />
            <stop offset="100%" className="audit-trend-area__stop audit-trend-area__stop--bottom" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const ty = y(tick);
          return (
            <g key={tick}>
              <line
                className={tick === 0
                  ? "audit-chart__grid audit-chart__grid--zero"
                  : "audit-chart__grid"}
                x1={pad.left}
                x2={width - pad.right}
                y1={ty}
                y2={ty}
              />
              <text
                className="audit-chart__axis-label"
                x={pad.left - 10}
                y={ty + 4}
                textAnchor="end"
              >
                {formatCompactMoney(tick, language)}
              </text>
            </g>
          );
        })}

        <path
          className="audit-trend-area"
          d={areaPath}
          fill={`url(#audit-trend-fill-${metric.key})`}
        />

        <path className="audit-chart__line" d={path} />

        {latestNegative && (
          <line
            className="audit-trend-segment--negative"
            x1={pointList[1][0]}
            y1={pointList[1][1]}
            x2={pointList[2][0]}
            y2={pointList[2][1]}
          />
        )}

        {values.map((value, index) => {
          const px = x(index);
          const py = y(value);
          const isCurrent = index === values.length - 1;
          const isNegative = value < 0;
          const labelAbove = value >= 0;
          const labelY = labelAbove
            ? Math.max(pad.top + 11, py - 10)
            : Math.min(height - pad.bottom - 15, py + 19);

          return (
            <g key={years[index]}>
              <circle
                className={[
                  "audit-chart__point",
                  isCurrent ? "audit-chart__point--current" : "",
                  isNegative ? "audit-chart__point--negative" : "",
                ].filter(Boolean).join(" ")}
                cx={px}
                cy={py}
                r={isCurrent ? "5.5" : "4.5"}
              />
              <text
                className={[
                  "audit-chart__value-label",
                  isCurrent ? "audit-chart__value-label--current" : "",
                  isNegative ? "audit-chart__value-label--negative" : "",
                ].filter(Boolean).join(" ")}
                x={px}
                y={labelY}
                textAnchor="middle"
              >
                {formatCompactMoney(value, language)}
              </text>
              <text
                className="audit-chart__x-label"
                x={px}
                y={height - 10}
                textAnchor="middle"
              >
                {years[index]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AuditCustomComparisonGraph({
  metrics,
  years,
  language,
}: {
  metrics: SignalLinkedMetric[];
  years: string[];
  language: string;
}) {
  const width = 720;
  const height = 248;
  const pad = { top: 38, right: 20, bottom: 34, left: 76 };
  const values = metrics.flatMap((metric) => metric.values);
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const rawSpan = Math.max(1, maxRaw - minRaw);
  const step = niceStep(rawSpan / 4);
  const axisMin = Math.min(0, Math.floor(minRaw / step) * step);
  const axisMax = Math.max(step, Math.ceil(maxRaw / step) * step);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const y = (value: number) =>
    pad.top + ((axisMax - value) / Math.max(1, axisMax - axisMin)) * innerH;
  const zeroY = y(0);
  const groupWidth = innerW / Math.max(1, years.length);
  const usableGroupWidth = Math.min(groupWidth * 0.7, 132);
  const barGap = 5;
  const barWidth = Math.max(
    10,
    Math.min(34, (usableGroupWidth - barGap * Math.max(0, metrics.length - 1)) / Math.max(1, metrics.length)),
  );

  const ticks: number[] = [];
  for (let value = axisMin; value <= axisMax + step * 0.25; value += step) {
    ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
    if (ticks.length > 7) break;
  }

  return (
    <div className="audit-custom-comparison__graph">
      <div className="audit-custom-comparison__legend" aria-hidden="true">
        {metrics.map((metric, index) => (
          <span key={metric.key}>
            <i className={`audit-custom-comparison__legend-swatch audit-custom-comparison__legend-swatch--${index + 1}`} />
            {metric.label}
          </span>
        ))}
      </div>

      <svg
        className="audit-custom-comparison__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={metrics.map((metric) => metric.label).join(", ")}
      >
        {ticks.map((tick) => {
          const ty = y(tick);
          return (
            <g key={tick}>
              <line
                className={tick === 0
                  ? "audit-custom-comparison__grid audit-custom-comparison__grid--zero"
                  : "audit-custom-comparison__grid"}
                x1={pad.left}
                x2={width - pad.right}
                y1={ty}
                y2={ty}
              />
              <text
                className="audit-custom-comparison__axis-label"
                x={pad.left - 10}
                y={ty + 4}
                textAnchor="end"
              >
                {formatCompactMoney(tick, language)}
              </text>
            </g>
          );
        })}

        {years.map((year, yearIndex) => {
          const groupCenter = pad.left + groupWidth * yearIndex + groupWidth / 2;
          const totalBarsWidth = metrics.length * barWidth + Math.max(0, metrics.length - 1) * barGap;
          const startX = groupCenter - totalBarsWidth / 2;

          return (
            <g key={year}>
              {metrics.map((metric, metricIndex) => {
                const value = metric.values[yearIndex];
                const valueY = y(value);
                const rectY = Math.min(valueY, zeroY);
                const rectHeight = Math.max(2, Math.abs(valueY - zeroY));
                const x = startX + metricIndex * (barWidth + barGap);

                return (
                  <rect
                    key={metric.key}
                    className={[
                      "audit-custom-comparison__bar",
                      `audit-custom-comparison__bar--${metricIndex + 1}`,
                      value < 0 ? "audit-custom-comparison__bar--negative" : "",
                    ].filter(Boolean).join(" ")}
                    x={x}
                    y={rectY}
                    width={barWidth}
                    height={rectHeight}
                    rx="3"
                  >
                    <title>{`${metric.label} · ${year}: ${formatMoney(value, language)}`}</title>
                  </rect>
                );
              })}

              <text
                className="audit-custom-comparison__x-label"
                x={groupCenter}
                y={height - 10}
                textAnchor="middle"
              >
                {year}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AuditCustomComparison({
  metrics,
  years,
  selectedKeys,
  onSelect,
  language,
  labels,
  view,
}: {
  metrics: SignalLinkedMetric[];
  years: string[];
  selectedKeys: string[];
  onSelect: (slot: number, key: string) => void;
  language: string;
  labels: {
    title: string;
    metricAria: string;
    oneYear: string;
    threeYear: string;
  };
  view: "graph" | "table";
}) {
  const selectedMetrics = selectedKeys
    .map((key) => metrics.find((metric) => metric.key === key))
    .filter((metric): metric is SignalLinkedMetric => Boolean(metric));

  return (
    <div className="audit-custom-comparison">
      <div className="audit-custom-comparison__selectors">
        <div className="audit-custom-comparison__selector-spacer" aria-hidden="true" />
        {selectedKeys.map((key, index) => {
          const metric = metrics.find((item) => item.key === key);

          return (
            <div className="audit-custom-comparison__selector-cell" key={index}>
              <AppSelectField
                id={`audit-compare-metric-${index + 1}`}
                label=""
                ariaLabel={`${labels.metricAria} ${index + 1}`}
                value={key}
                onChange={(value) => onSelect(index, value)}
                compact
                sortOptions
                searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                options={metrics.map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
              />
              {metric && (
                <span className="audit-custom-comparison__selector-context">
                  {metric.sectionTitle}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {view === "graph" ? (
        <div className="audit-custom-comparison__viewport">
          <AuditCustomComparisonGraph
            metrics={selectedMetrics}
            years={years}
            language={language}
          />
        </div>
      ) : (
        <div className="audit-custom-comparison__viewport">
          <div
            className="audit-custom-comparison__matrix"
            role="table"
            aria-label={labels.title}
          >
          {years.map((year, yearIndex) => (
            <div
              className={yearIndex === years.length - 1
                ? "audit-custom-comparison__row audit-custom-comparison__row--current"
                : "audit-custom-comparison__row"}
              role="row"
              key={year}
            >
              <div className="audit-custom-comparison__year" role="rowheader">
                {year}
              </div>
              {selectedMetrics.map((metric) => {
                const value = metric.values[yearIndex];
                return (
                  <div
                    className={value < 0
                      ? "audit-custom-comparison__value audit-custom-comparison__value--negative"
                      : "audit-custom-comparison__value"}
                    role="cell"
                    key={metric.key}
                    title={formatMoney(value, language)}
                  >
                    {formatMoney(value, language)}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="audit-custom-comparison__row audit-custom-comparison__row--change" role="row">
            <div className="audit-custom-comparison__year" role="rowheader">
              {labels.oneYear}
            </div>
            {selectedMetrics.map((metric) => {
              const value = changePercent(metric.values[2], metric.values[1]);
              const negative = (value ?? 0) < 0;
              return (
                <div
                  className={negative
                    ? "audit-custom-comparison__change audit-custom-comparison__change--negative"
                    : "audit-custom-comparison__change"}
                  role="cell"
                  key={metric.key}
                >
                  {formatChange(value, language)}
                </div>
              );
            })}
          </div>

          <div className="audit-custom-comparison__row audit-custom-comparison__row--change" role="row">
            <div className="audit-custom-comparison__year" role="rowheader">
              {labels.threeYear}
            </div>
            {selectedMetrics.map((metric) => {
              const value = changePercent(metric.values[2], metric.values[0]);
              const negative = (value ?? 0) < 0;
              return (
                <div
                  className={negative
                    ? "audit-custom-comparison__change audit-custom-comparison__change--negative"
                    : "audit-custom-comparison__change"}
                  role="cell"
                  key={metric.key}
                >
                  {formatChange(value, language)}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

interface AuditCandidatesPageProps {
  initialInitiateOpen?: boolean;
}

export function AuditCandidatesPage({
  initialInitiateOpen = false,
}: AuditCandidatesPageProps) {
  const { isDesktop } = useUIState();
  const { t, i18n } = useTranslation("audit");
  const { t: tc } = useTranslation("common");
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<AuditCandidateRecord[]>(() =>
    getAuditCandidates(),
  );
  const routeBatchId = searchParams.get("batch");
  const routeCandidateId = searchParams.get("candidate");
  const routeSelectionTrack = searchParams.get("selectionTrack");
  const routeSelectedOn = searchParams.get("selectedOn");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(() => {
    if (routeBatchId) return routeBatchId;
    if (!routeCandidateId) return null;
    return rows.find((candidate) => candidate.candidate_id === routeCandidateId)?.batch_id ?? null;
  });
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    () => routeCandidateId,
  );
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [explanation, setExplanation] = useState<AuditExplanation | null>(null);
  const [quickSummaryCandidateId, setQuickSummaryCandidateId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const initialDashboardFilters = {
    ...(routeSelectionTrack ? { selection_track: routeSelectionTrack } : {}),
    ...(routeSelectedOn ? { selected_on: routeSelectedOn } : {}),
  };
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialDashboardFilters);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(initialDashboardFilters);
  const [initiateOpen, setInitiateOpen] = useState(initialInitiateOpen);
  const [selectedTrendMetricKey, setSelectedTrendMetricKey] = useState("");
  const [compareMetricKeys, setCompareMetricKeys] = useState<string[]>([
    "sourceOfFund",
    "netWealth",
    "grossWealth",
  ]);
  const [customComparisonView, setCustomComparisonView] = useState<"graph" | "table">("graph");
  const [comparisonView, setComparisonView] = useState<"focus" | "full">("focus");

  useEffect(() => {
    if (routeCandidateId) {
      const candidate = rows.find((item) => item.candidate_id === routeCandidateId);
      setSelectedCandidateId(candidate ? routeCandidateId : null);
      setSelectedBatchId(routeBatchId ?? candidate?.batch_id ?? null);
      return;
    }

    setSelectedCandidateId(null);
    setSelectedBatchId(routeBatchId);
  }, [routeBatchId, routeCandidateId, rows]);

  const batchRows = useMemo(() => groupBatches(rows), [rows]);

  const selectedBatch = useMemo(
    () =>
      selectedBatchId
        ? batchRows.find(
            (row) => String(row.batch_id ?? "") === selectedBatchId,
          ) ?? null
        : null,
    [batchRows, selectedBatchId],
  );

  const batchCandidates = useMemo(
    () =>
      selectedBatchId
        ? rows.filter((row) => row.batch_id === selectedBatchId)
        : [],
    [rows, selectedBatchId],
  );

  const childRows = useMemo<TableRow[]>(
    () =>
      batchCandidates.map((candidate) => ({
        ...candidate,
        primary_reason: getCandidateReason(candidate, t),
      })),
    [batchCandidates, t, i18n.resolvedLanguage],
  );

  const selectedCandidate = useMemo(
    () =>
      selectedCandidateId
        ? batchCandidates.find(
            (candidate) => candidate.candidate_id === selectedCandidateId,
          ) ?? null
        : null,
    [batchCandidates, selectedCandidateId],
  );

  const sourceTaxpayer = useMemo(
    () => (selectedCandidate ? getSourceTaxpayer(selectedCandidate) : undefined),
    [selectedCandidate],
  );

  const comparison = useMemo(
    () => (selectedCandidate ? buildComparison(selectedCandidate) : []),
    [selectedCandidate],
  );

  const years = useMemo(
    () =>
      selectedCandidate
        ? assessmentYearHistory(selectedCandidate.assessment_year)
        : [],
    [selectedCandidate],
  );

  const currentSignals = useMemo(
    () => (selectedCandidate ? signalIds(selectedCandidate.signals) : []),
    [selectedCandidate],
  );

  const currentControlFlags = useMemo(
    () =>
      selectedCandidate ? controlFlagIds(selectedCandidate.control_flags) : [],
    [selectedCandidate],
  );

  const batchCols: ColDef[] = [
    fc("batch_id", t("candidates.columns.batchId"), { mono: true }),
    fc("assessment_year", t("columns.assessmentYear")),
    fc("selection_track", t("candidates.columns.selectionTrack"), {
      truncate: "normal",
    }),
    fc("candidate_count", t("candidates.columns.candidateCount"), {
      mono: true,
    }),
    fc("population_considered", t("candidates.columns.populationConsidered"), {
      mono: true,
    }),
    fc("funnel_rule", t("candidates.columns.funnelRule"), {
      truncate: "normal",
    }),
    fc("selected_on", t("candidates.columns.selectedOn")),
  ];

  const candidateCols: ColDef[] = [
    fc("taxpayer_name", t("columns.taxpayer")),
    fc("tin", t("columns.tin"), { mono: true }),
    fc("circle", t("columns.circle")),
    fc("risk_level", t("columns.riskLevel")),
    fc("primary_reason", t("candidates.columns.primaryReason"), {
      truncate: "long",
    }),
    fc("signals", t("columns.signals"), { truncate: "normal" }),
    {
      type: "col",
      col: {
        key: "audit_status",
        label: t("candidates.columns.auditStatus"),
        badge: true,
      },
    },
  ];

  const batchFilters: FilterDef[] = [
    {
      key: "assessment_year",
      label: t("columns.assessmentYear"),
      type: "select",
      options: ["", ...unique(batchRows, "assessment_year")],
    },
    {
      key: "selection_track",
      label: t("candidates.filters.selectionTrack"),
      type: "select",
      options: ["", ...unique(batchRows, "selection_track")],
    },
    {
      key: "selected_on",
      label: t("candidates.columns.selectedOn"),
      type: "select",
      options: ["", ...unique(batchRows, "selected_on")],
    },
  ];

  const candidateFilters: FilterDef[] = [
    {
      key: "circle",
      label: t("filters.circle"),
      type: "select",
      options: ["", ...unique(childRows, "circle")],
    },
    {
      key: "risk_level",
      label: t("filters.riskLevel"),
      type: "select",
      options: ["", ...unique(childRows, "risk_level")],
    },
    {
      key: "audit_status",
      label: t("candidates.columns.auditStatus"),
      type: "select",
      options: ["", ...unique(childRows, "audit_status")],
    },
  ];

  const tableRows = selectedBatchId ? childRows : batchRows;
  const activeFilters = selectedBatchId ? candidateFilters : batchFilters;
  const activeCols = selectedBatchId ? candidateCols : batchCols;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return tableRows.filter((row) => {
      const searchOk =
        !needle ||
        Object.values(row).some((value) =>
          String(value ?? "").toLowerCase().includes(needle),
        );
      const filterOk = activeFilters.every((filter) => {
        const selected = appliedFilters[filter.key];
        return !selected || String(row[filter.key] ?? "") === selected;
      });
      return searchOk && filterOk;
    });
  }, [tableRows, activeFilters, appliedFilters, q]);

  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / PER_PAGE)),
  );
  const pageRows = filtered.slice(
    (safePage - 1) * PER_PAGE,
    safePage * PER_PAGE,
  );
  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);

  const resetTableState = () => {
    setQ("");
    setPage(1);
    setShowFilter(false);
    setFilterValues({});
    setAppliedFilters({});
  };

  const applyFilters = () => {
    setAppliedFilters(
      Object.fromEntries(
        Object.entries(filterValues).filter(([, value]) => value),
      ),
    );
    setShowFilter(false);
    setPage(1);
  };

  const resetFilters = () => {
    setFilterValues({});
    setAppliedFilters({});
    setPage(1);
  };

  const openBatch = (row: TableRow) => {
    const batchId = String(row.batch_id ?? "");
    setSelectedBatchId(batchId);
    setSelectedCandidateId(null);
    setSearchParams(batchId ? { batch: batchId } : {});
    resetTableState();
  };

  const openCandidate = (row: TableRow) => {
    setQuickSummaryCandidateId(null);
    const candidateId = String(row.candidate_id ?? "");
    setSelectedCandidateId(candidateId);
    setSelectedTrendMetricKey("");
    setCompareMetricKeys(["sourceOfFund", "netWealth", "grossWealth"]);
    setCustomComparisonView("graph");
    setComparisonView("focus");

    const next = new URLSearchParams();
    if (selectedBatchId) next.set("batch", selectedBatchId);
    if (candidateId) next.set("candidate", candidateId);
    setSearchParams(next);
  };

  const backToBatches = () => {
    setQuickSummaryCandidateId(null);
    setSelectedBatchId(null);
    setSelectedCandidateId(null);
    setSearchParams({});
    resetTableState();
  };

  const backToCandidates = () => {
    setQuickSummaryCandidateId(null);
    setSelectedCandidateId(null);
    setSelectedTrendMetricKey("");
    setComparisonView("focus");

    const next = new URLSearchParams();
    if (selectedBatchId) next.set("batch", selectedBatchId);
    setSearchParams(next);
  };

  const explain = (key: string, value: string, row: TableRow) => {
    const lookupKey = key === "audit_status" ? "audit_state" : key;
    const resolved = resolveAuditExplanation(
      lookupKey,
      value,
      row,
      i18n.resolvedLanguage,
    );
    if (resolved) setExplanation(resolved);
  };

  if (selectedCandidate && selectedBatch) {
    const selectionReason = getCandidateReason(selectedCandidate, t);
    const quickSummaryOpen = quickSummaryCandidateId === selectedCandidate.candidate_id;
    const selectionCircles = Array.from(
      new Set(selectedCandidate.selection_basis.match(/Circle-\d+/g) ?? []),
    );
    const profileExplanationRow: TableRow = {
      ...(sourceTaxpayer ?? {}),
      ...selectedCandidate,
      audit_state:selectedCandidate.audit_status,
    };
    const candidateDetailItems = [
      {
        label:t("candidates.detail.labels.returnId"),
        value:selectedCandidate.return_id,
        conceptKey:"",
      },
      {
        label:t("candidates.detail.labels.dataQuality"),
        value:String(sourceTaxpayer?.data_quality ?? selectedCandidate.data_quality),
        conceptKey:"data_quality",
      },
      {
        label:t("candidates.detail.labels.coverageTier"),
        value:selectedCandidate.coverage_tier,
        conceptKey:"coverage_tier",
      },
      {
        label:t("candidates.detail.labels.selectionTrack"),
        value:selectedCandidate.selection_track,
        conceptKey:"",
      },
    ];

    const signalLinkedMetrics: SignalLinkedMetric[] = comparison.flatMap((section) =>
      section.metrics
        .filter((metric) =>
          currentSignals.some((signal) => metric.relatedSignals.includes(signal)),
        )
        .map((metric) => ({
          ...metric,
          sectionTitle: t(section.titleKey),
          label: t(metric.labelKey),
        })),
    );
    const allComparisonMetrics: SignalLinkedMetric[] = comparison.flatMap((section) =>
      section.metrics.map((metric) => ({
        ...metric,
        sectionTitle: t(section.titleKey),
        label: t(metric.labelKey),
      })),
    );
    const defaultTrendMetric =
      signalLinkedMetrics.find((metric) => metric.key === "difference" && metric.values[2] < 0) ??
      [...signalLinkedMetrics].sort((a, b) => {
        const aChange = Math.abs(changePercent(a.values[2], a.values[1]) ?? 0);
        const bChange = Math.abs(changePercent(b.values[2], b.values[1]) ?? 0);
        return bChange - aChange;
      })[0] ??
      allComparisonMetrics[0] ??
      null;
    const activeTrendMetric =
      allComparisonMetrics.find((metric) => metric.key === selectedTrendMetricKey) ??
      defaultTrendMetric;
    const currentValue = (key: string) => allComparisonMetrics.find((m) => m.key === key)?.values[2];
    const sourceFundCurrent = currentValue("sourceOfFund");
    const fundOutflowCurrent = currentValue("fundOutflow");
    const differenceCurrent = currentValue("difference");
    const hasReconciliation = [sourceFundCurrent, fundOutflowCurrent, differenceCurrent].every((v) => typeof v === "number" && Number.isFinite(v));
    const keyIndicators = [...signalLinkedMetrics]
      .sort((a, b) => {
        const aNegativeDifference = a.key === "difference" && a.values[2] < 0 ? 1 : 0;
        const bNegativeDifference = b.key === "difference" && b.values[2] < 0 ? 1 : 0;
        if (aNegativeDifference !== bNegativeDifference) {
          return bNegativeDifference - aNegativeDifference;
        }
        const aChange = Math.abs(changePercent(a.values[2], a.values[1]) ?? 0);
        const bChange = Math.abs(changePercent(b.values[2], b.values[1]) ?? 0);
        return bChange - aChange;
      })
      .slice(0, 4);

    const language = i18n.resolvedLanguage ?? "en";
    const listFormatter = new Intl.ListFormat(
      language.startsWith("bn") ? "bn-BD" : "en-US",
      { style: "short", type: "conjunction" },
    );
    const visibleAuditSignals = currentSignals.slice(0, 2);
    const auditIssueLabels = visibleAuditSignals.map((signal) =>
      t(SIGNAL_LABEL_KEYS[signal] ?? signal),
    );
    const auditIssue = auditIssueLabels.length
      ? `${listFormatter.format(auditIssueLabels)}${currentSignals.length > 2
          ? ` ${t("candidates.detail.auditNote.moreSignals", { count: currentSignals.length - 2 })}`
          : ""}`
      : selectionReason;
    const auditActionEvidence = Array.from(new Set(
      visibleAuditSignals.map((signal) =>
        t(SIGNAL_AUDIT_ACTION_KEYS[signal] ?? "candidates.detail.auditNote.defaultEvidence"),
      ),
    ));
    const auditNextAction = auditActionEvidence.length
      ? t(
          currentSignals.length > 2
            ? "candidates.detail.auditNote.nextActionWithMore"
            : "candidates.detail.auditNote.nextAction",
          {
            evidence: listFormatter.format(auditActionEvidence),
            count: Math.max(0, currentSignals.length - 2),
          },
        )
      : t("candidates.detail.auditNote.defaultAction");
    const auditNoteIndicator = keyIndicators[0] ?? null;

    const focusedComparison = comparison
      .map((section) => ({
        ...section,
        metrics: section.metrics.filter((metric) =>
          currentSignals.some((signal) => metric.relatedSignals.includes(signal)),
        ),
      }))
      .filter((section) => section.metrics.length > 0);
    const displayedComparison = comparisonView === "focus" ? focusedComparison : comparison;
    const updateCompareMetric = (slot: number, key: string) => {
      setCompareMetricKeys((current) => {
        const next = [...current];
        const duplicateIndex = next.findIndex((item, index) => item === key && index !== slot);

        if (duplicateIndex >= 0) {
          const previous = next[slot];
          next[slot] = key;
          next[duplicateIndex] = previous;
          return next;
        }

        next[slot] = key;
        return next;
      });
    };

    return (
      <div className="table-page audit-candidates-page">
        <div className="audit-detail-back-row">
          <SecondaryButton size="sm" icon={ArrowLeft} onClick={backToCandidates}>
            {t("candidates.detail.backToCandidates")}
          </SecondaryButton>
          <SecondaryButton
            size="sm"
            icon={Sparkles}
            className="audit-quick-summary__toggle"
            onClick={() => setQuickSummaryCandidateId(selectedCandidate.candidate_id)}
          >
            {t("candidates.detail.quickSummary.title")}
          </SecondaryButton>
        </div>


        <div className="audit-candidate-detail__header">
          <div className="audit-candidate-detail__top">
            <div className="audit-candidate-detail__identity">
              <h1 className="table-page__title">
                {selectedCandidate.taxpayer_name}
              </h1>
              <p className="table-page__desc audit-candidate-detail__meta">
                <span>{selectedCandidate.tin}</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="audit-concept-inline"
                  onClick={() => explain("circle", selectedCandidate.circle, profileExplanationRow)}
                >
                  {selectedCandidate.circle}
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="audit-concept-inline"
                  onClick={() => explain("assessment_year", selectedCandidate.assessment_year, profileExplanationRow)}
                >
                  {selectedCandidate.assessment_year}
                </button>
              </p>
            </div>
            <div className="audit-candidate-detail__statuses">
              <div className="audit-candidate-detail__status-card audit-candidate-detail__status-card--risk">
                <p>{t("columns.riskLevel")}</p>
                <button
                  type="button"
                  className="audit-concept-inline audit-concept-inline--strong"
                  onClick={() => explain("risk_level", selectedCandidate.risk_level, profileExplanationRow)}
                >
                  {selectedCandidate.risk_level}
                </button>
              </div>
              <div className="audit-candidate-detail__status-card">
                <p>{t("candidates.columns.auditStatus")}</p>
                <button
                  type="button"
                  className="audit-concept-inline"
                  onClick={() => explain("audit_status", selectedCandidate.audit_status, profileExplanationRow)}
                >
                  <StatusBadge value={selectedCandidate.audit_status} />
                </button>
              </div>
            </div>
          </div>

          <div className="audit-candidate-context-strip" aria-label={t("candidates.detail.taxpayerSummary")}>
            {candidateDetailItems.map((item) => (
              <div className="audit-candidate-context-strip__item" key={item.label}>
                <p>{item.label}</p>
                {item.conceptKey ? (
                  <button
                    type="button"
                    className="audit-concept-inline audit-concept-inline--strong"
                    onClick={() => explain(item.conceptKey, item.value, profileExplanationRow)}
                  >
                    {item.value || "—"}
                  </button>
                ) : (
                  <strong>{item.value || "—"}</strong>
                )}
              </div>
            ))}
          </div>
        </div>

        <section className="audit-note-strip" aria-labelledby="audit-note-title">
          <div className="audit-note-strip__title">
            <ShieldAlert size={15} aria-hidden="true" />
            <strong id="audit-note-title">{t("candidates.detail.auditNote.title")}</strong>
          </div>

          <div className="audit-note-strip__grid">
            <div className="audit-note-strip__item">
              <span>{t("candidates.detail.auditNote.situation")}</span>
              <strong>
                {t("candidates.detail.auditNote.situationValue", {
                  risk: selectedCandidate.risk_level,
                  status: selectedCandidate.audit_status,
                })}
              </strong>
            </div>

            <div className="audit-note-strip__item audit-note-strip__item--issue">
              <span>{t("candidates.detail.auditNote.issue")}</span>
              <strong>{auditIssue}</strong>
              {auditNoteIndicator && (
                <small>
                  {auditNoteIndicator.label}: {formatMoney(
                    auditNoteIndicator.values[2],
                    language,
                  )}
                </small>
              )}
            </div>

            <div className="audit-note-strip__item audit-note-strip__item--action">
              <span>{t("candidates.detail.auditNote.nextActionLabel")}</span>
              <strong>{auditNextAction}</strong>
            </div>
          </div>
        </section>

        <section
          className="audit-detail-card audit-selection-evidence"
          aria-labelledby="selection-reason-title"
        >
          <div className="audit-selection-decision">
            <div className="audit-selection-decision__heading">
              <h2 id="selection-reason-title">{t("candidates.detail.selectionReason")}</h2>
              <Tooltip title={t("candidates.detail.selectionReasonHelp")} arrow><button type="button" className="audit-inline-help" aria-label={t("candidates.detail.moreInfo")}><Info size={15} /></button></Tooltip>
            </div>

            <Tooltip title={selectionReason} arrow><p className="audit-selection-decision__reason audit-selection-decision__reason--compact">{selectionReason}</p></Tooltip>

            {currentSignals.length > 0 && (
              <div className="audit-selection-signals">
                <p>{t("candidates.detail.signalsShort")}</p>
                <div className="audit-evidence-chips">
                  {currentSignals.map((signal) => (
                    <Tooltip
                      key={signal}
                      title={t(SIGNAL_LABEL_KEYS[signal] ?? signal)}
                      arrow
                      placement="top"
                    >
                      <button
                        type="button"
                        className="audit-evidence-chip audit-evidence-chip--button"
                        onClick={() => explain("signals", signal, profileExplanationRow)}
                      >
                        <strong>{signal}</strong>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            <div className="audit-selection-decision__guardrail">
              <span>{t("candidates.detail.guardrailShort")}</span>
              <Tooltip title={t("candidates.detail.selectionReasonHelp")} arrow placement="top">
                <button
                  type="button"
                  className="audit-inline-help"
                  aria-label={t("candidates.detail.moreInfo")}
                >
                  <Info size={13} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </div>

          {hasReconciliation && currentSignals.some((signal) => signal === "R-C1" || signal === "R-C2") && (
            <div className="audit-reconciliation-strip">
              <strong>{t("candidates.detail.ux.reconciliation")}</strong>
              <span>{t("candidates.detail.metrics.sourceOfFund")}: {formatMoney(sourceFundCurrent!, language)}</span>
              <span>{t("candidates.detail.metrics.fundOutflow")}: {formatMoney(fundOutflowCurrent!, language)}</span>
              <b className={differenceCurrent! < 0 ? "audit-reconciliation-strip__negative" : ""}>{t("candidates.detail.metrics.difference")}: {formatMoney(differenceCurrent!, language)}</b>
              <Tooltip title={t("candidates.detail.ux.formulaHelp")} arrow>
                <button type="button" className="audit-inline-help" aria-label={t("candidates.detail.ux.formulaHelp")}><Info size={14} /></button>
              </Tooltip>
            </div>
          )}
          {keyIndicators.length > 0 && (
            <div className="audit-key-indicators">
              <div className="audit-key-indicators__header">
                <h3>{t("candidates.detail.keyIndicatorsTitle")}</h3>
              </div>

              <div className="audit-key-indicators__grid">
                {keyIndicators.map((metric) => {
                  const oneYear = changePercent(metric.values[2], metric.values[1]);
                  const threeYear = changePercent(metric.values[2], metric.values[0]);
                  const linkedSignals = currentSignals.filter((signal) =>
                    metric.relatedSignals.includes(signal),
                  );
                  const negativeBalance = metric.key === "difference" && metric.values[2] < 0;

                  return (
                    <article
                      className={negativeBalance ? "audit-key-indicator audit-key-indicator--negative" : "audit-key-indicator"}
                      key={metric.key}
                    >
                      <div className="audit-key-indicator__top">
                        <p>{metric.label}</p>
                        <div className="audit-key-indicator__signals" aria-label={t("candidates.detail.triggeredSignals")}>
                          {negativeBalance && (
                            <span className="audit-key-indicator__negative-tag">{t("candidates.detail.negativeBalance")}</span>
                          )}
                          {linkedSignals.map((signal) => (
                            <Tooltip
                              key={signal}
                              title={t(SIGNAL_LABEL_KEYS[signal] ?? signal)}
                              arrow
                              placement="top"
                            >
                              <button
                                type="button"
                                onClick={() => explain("signals", signal, profileExplanationRow)}
                              >
                                {signal}
                              </button>
                            </Tooltip>
                          ))}
                        </div>
                      </div>

                      <strong>{formatMoney(metric.values[2], i18n.resolvedLanguage ?? "en")}</strong>

                      <div className="audit-key-indicator__changes">
                        <Tooltip title={t("candidates.detail.ux.changeHelp")} arrow><span>{t("candidates.detail.change1y")} <b>{metric.values[1] * metric.values[2] < 0 ? formatMoney(metric.values[2] - metric.values[1], language) : formatChange(oneYear, language)}</b></span></Tooltip>
                        <Tooltip title={t("candidates.detail.ux.changeHelp")} arrow><span>{t("candidates.detail.change3y")} <b>{metric.values[0] * metric.values[2] < 0 ? formatMoney(metric.values[2] - metric.values[0], language) : formatChange(threeYear, language)}</b></span></Tooltip>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <details className="audit-selection-process">
            <summary>{t("candidates.detail.selectionProcessDetails")}</summary>
            <div className="audit-selection-process__grid">
              <div>
                <p>{t("candidates.detail.selectionTrackLabel")}</p>
                <strong>{selectedCandidate.selection_track}</strong>
              </div>
              <div>
                <p>{t("candidates.detail.circlesLabel")}</p>
                <strong>{selectionCircles.length ? selectionCircles.join(", ") : "—"}</strong>
              </div>
              <div>
                <p>{t("candidates.detail.signalsShort")}</p>
                {currentSignals.length ? (
                      <span className="audit-summary-signal-list">
                        {currentSignals.map((signal) => (
                          <Tooltip key={signal} title={t(SIGNAL_LABEL_KEYS[signal] ?? signal)} arrow>
                            <button type="button" className="audit-concept-inline"
                              aria-label={`${signal}: ${t(SIGNAL_LABEL_KEYS[signal] ?? signal)}`}
                              onClick={() => explain("signals", signal, profileExplanationRow)}>
                              {signal}
                            </button>
                          </Tooltip>
                        ))}
                      </span>
                    ) : "—"}
              </div>
              <div>
                <p>{t("candidates.detail.funnelRule")}</p>
                <strong>{selectedCandidate.funnel_rule}</strong>
              </div>
              {currentControlFlags.length > 0 && (
                <div>
                  <p>{t("candidates.detail.controlFlags")}</p>
                  <strong>{currentControlFlags.join(", ")}</strong>
                </div>
              )}
            </div>
          </details>
        </section>

        <section
          className="audit-detail-card audit-comparison-card"
          aria-labelledby="return-comparison-title"
        >
          <div className="audit-detail-card__header audit-comparison-card__header">
            <div className="audit-comparison-card__title-row">
              <h2 id="return-comparison-title">{t("candidates.detail.comparisonTitle")}</h2>
              <Tooltip title={`${t("candidates.detail.comparisonDescription")} ${t("candidates.detail.ux.historicalHelp")}`} arrow placement="top">
                <button
                  type="button"
                  className="audit-inline-help"
                  aria-label={t("candidates.detail.moreInfo")}
                >
                  <Info size={14} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <div className="audit-view-switch">
              <div className="audit-view-toggle" role="group" aria-label={t("candidates.detail.viewMode")}>
                <button
                  type="button"
                  className={comparisonView === "focus" ? "audit-view-toggle__button audit-view-toggle__button--active" : "audit-view-toggle__button"}
                  onClick={() => setComparisonView("focus")}
                  aria-pressed={comparisonView === "focus"}
                >
                  {t("candidates.detail.focusView")}
                </button>
                <button
                  type="button"
                  className={comparisonView === "full" ? "audit-view-toggle__button audit-view-toggle__button--active" : "audit-view-toggle__button"}
                  onClick={() => setComparisonView("full")}
                  aria-pressed={comparisonView === "full"}
                >
                  {t("candidates.detail.fullView")}
                </button>
              </div>
            </div>
          </div>

          {comparisonView === "focus" && signalLinkedMetrics.length > 0 && activeTrendMetric && (
            <section className="audit-visual-analysis" aria-label={t("candidates.detail.visualAnalysisTitle")}>
              <div className="audit-visual-analysis__grid">
                <div className="audit-visual-panel">
                  <div className="audit-visual-panel__header audit-visual-panel__header--trend">
                    <h4>{t("candidates.detail.trendTitle")}</h4>
                    <div className="audit-visual-analysis__selector">
                      <AppSelectField
                        id="audit-trend-metric"
                        label=""
                        ariaLabel={t("candidates.detail.trendMetric")}
                        value={activeTrendMetric.key}
                        onChange={setSelectedTrendMetricKey}
                        compact
                        sortOptions
                        searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                        options={allComparisonMetrics.map((metric) => ({
                          value: metric.key,
                          label: metric.label,
                        }))}
                      />
                    </div>
                  </div>
                  <AuditTrendChart
                    metric={activeTrendMetric}
                    years={years}
                    language={i18n.resolvedLanguage ?? "en"}
                    title={t("candidates.detail.trendTitle")}
                    description={t("candidates.detail.trendDescription")}
                    oneYearLabel={t("candidates.detail.change1y")}
                    threeYearLabel={t("candidates.detail.change3y")}
                  />
                </div>

                <div className="audit-visual-panel">
                  <div className="audit-visual-panel__header audit-visual-panel__header--comparison">
                    <h4>{t("candidates.detail.customComparisonTitle")}</h4>
                    <div
                      className="audit-view-toggle audit-view-toggle--compact"
                      role="group"
                      aria-label={t("candidates.detail.customComparisonView")}
                    >
                      <button
                        type="button"
                        className={customComparisonView === "graph"
                          ? "audit-view-toggle__button audit-view-toggle__button--active"
                          : "audit-view-toggle__button"}
                        onClick={() => setCustomComparisonView("graph")}
                        aria-pressed={customComparisonView === "graph"}
                      >
                        {t("candidates.detail.graphView")}
                      </button>
                      <button
                        type="button"
                        className={customComparisonView === "table"
                          ? "audit-view-toggle__button audit-view-toggle__button--active"
                          : "audit-view-toggle__button"}
                        onClick={() => setCustomComparisonView("table")}
                        aria-pressed={customComparisonView === "table"}
                      >
                        {t("candidates.detail.tableView")}
                      </button>
                    </div>
                  </div>
                  <AuditCustomComparison
                    metrics={allComparisonMetrics}
                    years={years}
                    selectedKeys={compareMetricKeys}
                    onSelect={updateCompareMetric}
                    language={i18n.resolvedLanguage ?? "en"}
                    view={customComparisonView}
                    labels={{
                      title: t("candidates.detail.customComparisonTitle"),
                      metricAria: t("candidates.detail.customComparisonMetric"),
                      oneYear: t("candidates.detail.change1y"),
                      threeYear: t("candidates.detail.change3y"),
                    }}
                  />
                </div>
              </div>
            </section>
          )}

          {comparisonView === "focus" && (
            <div className="audit-focus-evidence-heading">
              <h3>{t("candidates.detail.evidenceTableTitle")}</h3>
            </div>
          )}

          <div className="audit-comparison-table-wrap">
              <table className={comparisonView === "focus" ? "audit-comparison-table audit-comparison-table--focus" : "audit-comparison-table"}>
                <thead>
                  <tr>
                    <th scope="col">
                      <p>{t("candidates.detail.returnItem")}</p>
                    </th>
                    {years.map((year, index) => (
                      <th
                        scope="col"
                        key={year}
                        className={index === years.length - 1 ? "audit-comparison-table__current-year" : undefined}
                      >
                        <p>{year}</p>
                      </th>
                    ))}
                    <th scope="col">
                      <p>{t("candidates.detail.change1y")}</p>
                    </th>
                    <th scope="col">
                      <p>{t("candidates.detail.change3y")}</p>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedComparison.map((section) => (
                    <Fragment key={section.key}>
                      {comparisonView === "full" && (
                        <tr className="audit-comparison-table__section-row">
                          <th colSpan={6} scope="rowgroup">
                            <h3>{t(section.titleKey)}</h3>
                          </th>
                        </tr>
                      )}
                      {section.metrics.map((metric) => {
                        const related = currentSignals.some((signal) =>
                          metric.relatedSignals.includes(signal),
                        );
                        const oneYear = changePercent(
                          metric.values[2],
                          metric.values[1],
                        );
                        const threeYear = changePercent(
                          metric.values[2],
                          metric.values[0],
                        );
  
                        const negativeBalance = metric.key === "difference" && metric.values[2] < 0;
  
                        return (
                          <tr
                            className={
                              negativeBalance
                                ? "audit-comparison-table__metric-row audit-comparison-table__metric-row--related audit-comparison-table__metric-row--negative"
                                : related
                                  ? "audit-comparison-table__metric-row audit-comparison-table__metric-row--related"
                                  : "audit-comparison-table__metric-row"
                            }
                            key={metric.key}
                          >
                            <th scope="row">
                              <p>{t(metric.labelKey)}</p>
                              {(comparisonView === "full" && related) || negativeBalance ? (
                                <div className="audit-comparison-table__row-tags">
                                  {comparisonView === "full" && related && (
                                    <span className="audit-comparison-table__signal-tag">
                                      {t("candidates.detail.signalTag")}
                                    </span>
                                  )}
                                  {negativeBalance && (
                                    <span className="audit-comparison-table__negative-tag">
                                      {t("candidates.detail.negativeBalance")}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </th>
                            {metric.values.map((value, index) => (
                              <td
                                key={years[index]}
                                className={index === years.length - 1 ? "audit-comparison-table__current-year" : undefined}
                              >
                                <p>{formatMoney(value, i18n.resolvedLanguage ?? "en")}</p>
                              </td>
                            ))}
                            <td>
                              <p>
                                {metric.values[1] * metric.values[2] < 0 ? formatMoney(metric.values[2] - metric.values[1], language) : formatChange(oneYear, language)}
                              </p>
                            </td>
                            <td>
                              <p>
                                {metric.values[0] * metric.values[2] < 0 ? formatMoney(metric.values[2] - metric.values[0], language) : formatChange(threeYear, language)}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
        </section>
        <ResponsiveOverlay
          open={quickSummaryOpen}
          onClose={() => setQuickSummaryCandidateId(null)}
          title={t("candidates.detail.quickSummary.title")}
          closeLabel={tc("accessibility.closeDrawer")}
          desktopWidth="560px"
          className="audit-summary-drawer"
        >
          <div className="form-stack audit-summary-drawer__content">
            <section className="detail-section">
              <h3 className="detail-section__head detail-section__head--static">{selectedCandidate.taxpayer_name}</h3>
              <p className="audit-summary-drawer__meta">
                {t("candidates.detail.labels.returnId")}: {selectedCandidate.return_id}
                {" · "}{selectedCandidate.circle}
                {" · "}{selectedCandidate.assessment_year}
              </p>
              <div className="drawer-field-grid">
                <div className="drawer-field">
                  <span className="drawer-field__label">{t("columns.riskLevel")}</span>
                  <div className="drawer-field__value"><strong>{selectedCandidate.risk_level}</strong></div>
                </div>
                <div className="drawer-field">
                  <span className="drawer-field__label">{t("candidates.columns.auditStatus")}</span>
                  <div className="drawer-field__value"><strong>{selectedCandidate.audit_status}</strong></div>
                </div>
              </div>
            </section>
            <section className="detail-section">
              <h3 className="detail-section__head detail-section__head--static">{t("candidates.detail.selectionReason")}</h3>
              <p className="audit-summary-drawer__copy">{selectionReason}</p>
            </section>
            {currentSignals.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section__head detail-section__head--static">{t("candidates.detail.signalsShort")}</h3>
                <div className="audit-summary-drawer__signals">
                  {currentSignals.map((signal) => (
                    <Tooltip key={signal} title={t(SIGNAL_LABEL_KEYS[signal] ?? signal)} arrow placement="top">
                      <button type="button" className="audit-summary-drawer__signal"
                        aria-label={`${signal}: ${t(SIGNAL_LABEL_KEYS[signal] ?? signal)}`}
                        onClick={() => {
                          setQuickSummaryCandidateId(null);
                          explain("signals", signal, profileExplanationRow);
                        }}>
                        <strong>{signal}</strong>
                        <span>{t(SIGNAL_LABEL_KEYS[signal] ?? signal)}</span>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </section>
            )}
            {auditNoteIndicator && (
              <section className="detail-section">
                <h3 className="detail-section__head detail-section__head--static">{t("candidates.detail.auditNote.issue")}</h3>
                <div className="drawer-field-grid">
                  <div className="drawer-field drawer-field--wide">
                    <span className="drawer-field__label">{auditNoteIndicator.label}</span>
                    <div className="drawer-field__value">
                      <strong>{formatMoney(auditNoteIndicator.values[2], language)}</strong>
                    </div>
                  </div>
                </div>
              </section>
            )}
            <section className="detail-section">
              <h3 className="detail-section__head detail-section__head--static">{t("candidates.detail.auditNote.nextActionLabel")}</h3>
              <p className="audit-summary-drawer__copy">{auditNextAction}</p>
            </section>
            <p className="audit-summary-drawer__caution">{t("candidates.detail.guardrailShort")}</p>
          </div>
        </ResponsiveOverlay>
        <AuditExplainerDrawer explanation={explanation} onClose={() => setExplanation(null)} />
      </div>
    );
  }

  const tableTitle = selectedBatchId
    ? t("candidates.selectedTableTitle")
    : t("candidates.batchTableTitle");

  const tableDescription = selectedBatchId
    ? t("candidates.selectedTableDescription", {
        batchId: selectedBatch?.batch_id ?? "",
        track: selectedBatch?.selection_track ?? "",
        funnelRule: selectedBatch?.funnel_rule ?? "",
        count: batchCandidates.length,
      })
    : t("candidates.description");

  return (
    <div className="table-page audit-candidates-page">
      <div className="table-page__header">
        <div>
          <h1 className="table-page__title">
            {selectedBatchId
              ? t("candidates.selectedTitle")
              : t("candidates.title")}
          </h1>
          <p className="table-page__desc">{tableDescription}</p>
        </div>

        {!selectedBatchId && (
          <div className="table-page__actions">
            <button
              type="button"
              className="table-card__toolbar-btn table-card__toolbar-btn--primary"
              onClick={() => setInitiateOpen(true)}
            >
              <Plus size={13} aria-hidden="true" />
              {t("candidates.initiateAction")}
            </button>
          </div>
        )}
      </div>

      <MobileSearchFilter
        searchValue={q}
        onSearchChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        onFilterClick={() => setShowFilter((open) => !open)}
        placeholder={tc("common.searchPlaceholder")}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="table-card">
        <div className="table-card__toolbar">
          <div className="table-card__title-group">
            {selectedBatchId && (
              <SecondaryButton size="sm" icon={ArrowLeft} onClick={backToBatches}>
                {t("candidates.backToBatches")}
              </SecondaryButton>
            )}
            <h2 className="table-card__title">{tableTitle}</h2>
            <span className="table-card__count">
              {filtered.length} {tc("common.records")}
            </span>
          </div>

          <div className="table-card__search-wrapper">
            <AppSearchField
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(1);
              }}
              label={tc("common.searchPlaceholder")}
              placeholder={tc("common.searchPlaceholder")}
              size="compact"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFilter((open) => !open)}
            className={
              showFilter
                ? "table-card__toolbar-btn table-card__toolbar-btn--active"
                : "table-card__toolbar-btn"
            }
          >
            <Filter size={13} aria-hidden="true" /> {tc("actions.filter")}
          </button>
          <button
            type="button"
            className="table-card__toolbar-btn table-card__toolbar-btn--download"
            onClick={() => handleExportDisabled(tc("actions.exportDisabled"))}
          >
            <Download size={13} aria-hidden="true" /> {tc("actions.export")}
          </button>
          <button
            type="button"
            className="table-card__toolbar-btn table-card__toolbar-btn--print"
            onClick={() => window.print()}
          >
            <Printer size={13} aria-hidden="true" /> {tc("actions.print")}
          </button>
        </div>

        {isDesktop && showFilter && (
          <div className="table-card__filter-panel">
            <FilterPanel
              filters={activeFilters}
              values={filterValues}
              onChange={(key, value) =>
                setFilterValues((prev) => ({ ...prev, [key]: value }))
              }
              onApply={applyFilters}
              onReset={resetFilters}
              sortSelectOptions
              searchableSelectsAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
            />
          </div>
        )}

        <AppliedFilterChips
          values={appliedFilters}
          onClear={resetFilters}
          inCard
        />

        <ResponsiveTable
          cols={activeCols}
          rows={pageRows}
          onRowClick={selectedBatchId ? openCandidate : openBatch}
          noCard
          clickableKeys={selectedBatchId ? ["circle", "risk_level", "signals", "audit_status"] : []}
          onCellClick={explain}
          mobileCardMapping={
            selectedBatchId
              ? {
                  primary: "taxpayer_name",
                  identifier: "tin",
                  meta: ["circle", "risk_level", "signals"],
                  status: "audit_status",
                }
              : {
                  primary: "batch_id",
                  identifier: "assessment_year",
                  meta: ["selection_track", "candidate_count", "funnel_rule"],
                  date: "selected_on",
                }
          }
          aria-label={tableTitle}
        />

        <div className="table-card__pagination">
          <Pagination
            total={filtered.length}
            page={safePage}
            perPage={PER_PAGE}
            onPage={setPage}
          />
        </div>
      </div>

      <AuditExplainerDrawer
        explanation={explanation}
        onClose={() => setExplanation(null)}
      />

      {initiateOpen && (
        <InitiateAuditModal
          open
          onClose={() => setInitiateOpen(false)}
          onConfirmed={() => {
            setRows(getAuditCandidates());
            setSelectedBatchId(null);
            setSelectedCandidateId(null);
            setSearchParams({});
            resetTableState();
          }}
        />
      )}

      {!isDesktop && (
        <MobileFilterOverlay
          isOpen={showFilter}
          filters={activeFilters}
          values={filterValues}
          onChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          onApply={applyFilters}
          onReset={resetFilters}
          onClose={() => setShowFilter(false)}
          sortSelectOptions
          searchableSelectsAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
        />
      )}
    </div>
  );
}
