import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2, ClipboardList, Clock, Database, FileSearch, Info, ListChecks, Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { TaxZoneSelectField } from "../../components/forms/TaxZoneSelectField";
import { AppNumberField } from "../../components/forms/AppNumberField";
import { AppChoiceCard } from "../../components/forms/AppChoiceCard";
import { AppSelectionRow } from "../../components/forms/AppSelectionRow";
import { FormSection } from "../../components/forms/FormSection";
import { CollapsibleFormSection } from "../../components/forms/CollapsibleFormSection";
import { AppStepper } from "../../components/shared/AppStepper";
import { Pagination } from "../../components/shared/Pagination";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { AppModal } from "../../components/modals/AppModal";
import type { TableRow } from "../modulePageUtils";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { AuditExplainerDrawer } from "./AuditExplainerDrawer";
import { resolveAuditExplanation, type AuditExplanation } from "./auditKnowledge";
import { saveAuditCandidates } from "./auditCandidateStore";
import { TAX_ZONES } from "../../data/taxZones";
import { VERIFIED_TAX_JURISDICTIONS, getVerifiedCirclesForZone } from "../../data/taxJurisdictions";

const AUDIT_DROPDOWN_SEARCH_THRESHOLD = 5;

const TRACK_STEPS = {
  population: ["setup", "population", "readiness", "preview", "funnel", "review"],
  risk: ["setup", "population", "readiness", "riskCriteria", "screeningRun", "preview", "funnel", "review"],
  manual: ["setup", "population", "readiness", "manualSelection", "preview", "funnel", "review"],
} as const;

type TrackId = keyof typeof TRACK_STEPS;

const TRACKS = [
  { id:"population", titleKey:"initiate.tracks.population.title", descKey:"initiate.tracks.population.desc" },
  { id:"risk", titleKey:"initiate.tracks.risk.title", descKey:"initiate.tracks.risk.desc" },
  { id:"manual", titleKey:"initiate.tracks.manual.title", descKey:"initiate.tracks.manual.desc" },
] as const;

const SIGNAL_OPTIONS = [
  ["R-A1","Zero income + declared asset"], ["R-A2","Income declared, tax payable zero"], ["R-A3","TDS-implied income floor"],
  ["R-B1","Large asset growth"], ["R-B2","Income falls while assets grow"],
  ["R-C1","Reconciliation gap"], ["R-C2","Multi-year cumulative gap"], ["R-C3","Opening wealth continuity break"], ["R-C4","Implausibly low expenditure"],
  ["R-D1","Persistent zero income / zero tax"], ["R-D2","Alternating declaration pattern"], ["R-D3","Amendment after trigger"],
  ["R-E1","Payroll / third-party income mismatch"], ["R-E2","Asset registry mismatch"], ["R-E3","VAT turnover mismatch"],
] as const;

const RISK_LEVELS = ["Low","Medium","High","Very High"] as const;
const ALL_ZONES_VALUE = "__ALL_ZONES__";
const CIRCLE_SCOPE_SEPARATOR = "|||";
const SCREENING_RUN_STORAGE_KEY = "nbr-audit-screening-run-v1";
const SCREENING_READY_AFTER_MS = 2 * 60 * 60 * 1000;

type ScreeningRunSnapshot = {
  assessmentYear: string;
  zone: string;
  scopeMode: string;
  circles: string[];
  dataQuality: string[];
  coverageTiers: string[];
  riskLevels: string[];
  signals: string[];
};

type ScreeningRunRecord = {
  signature: string;
  startedAt: number;
  readyAt: number;
  snapshot: ScreeningRunSnapshot;
};

type CircleScopeOption = {
  value: string;
  label: string;
  zone: string;
  circle: string;
};

function circleScopeValue(zone: string, circle: string): string {
  return `${zone}${CIRCLE_SCOPE_SEPARATOR}${circle}`;
}
// NBR press release dated 4 March 2026 reported more than 4 million
// 2025–26 e-returns. This is used only as a national-scale prototype floor;
// scoped counts are modeled from representative rows; the UI presents clean whole numbers.
const NBR_REPORTED_ERETURN_MIN_2025_26 = 4_000_000;

function clampCount(value: number) {
  return Math.max(0, Math.round(value));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(clampCount(value));
}

function unique(field: string): string[] {
  return Array.from(new Set(
    ALL_TAXPAYER_ROWS.map((row) => String(row[field] ?? "")).filter(Boolean)
  )).sort((a,b) => a.localeCompare(b));
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function signalIds(value: unknown): string[] {
  return Array.from(new Set(String(value ?? "").match(/R-[A-E]\d/g) ?? []));
}

function candidateMismatchAmount(row: TableRow): number {
  const value = Number(row.mismatch_amount ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatPreviewMoney(value: number, language: string): string {
  const locale = language?.toLowerCase().startsWith("bn") ? "bn-BD" : "en-BD";
  return "৳" + new Intl.NumberFormat(locale, {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function formatPreviewMoneyFull(value: number, language: string): string {
  const locale = language?.toLowerCase().startsWith("bn") ? "bn-BD" : "en-BD";
  return "৳" + new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatScreeningTime(value: number, language: string): string {
  const locale = language?.toLowerCase().startsWith("bn") ? "bn-BD" : "en-BD";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const RISK_PRIORITY: Record<string, number> = {
  "Very High": 4,
  High: 3,
  Medium: 2,
  Low: 1,
  "Not determined": 0,
};

interface InitiateAuditModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export function InitiateAuditModal({ open, onClose, onConfirmed }: InitiateAuditModalProps) {
  const { t, i18n } = useTranslation("audit");

  const assessmentYears = unique("assessment_year");
  const dataQualityAvailable = unique("data_quality");
  const coverageAvailable = unique("coverage_tier");

  const [step, setStep] = useState(0);
  const [maxCompletedStep, setMaxCompletedStep] = useState(-1);
  const [assessmentYear, setAssessmentYear] = useState(assessmentYears[0] ?? "2025-26");
  const [track, setTrack] = useState<TrackId>("risk");
  const [zone, setZone] = useState(ALL_ZONES_VALUE);
  const [scopeMode, setScopeMode] = useState("all");
  const [circles, setCircles] = useState<string[]>([]);
  const [circleSearch, setCircleSearch] = useState("");
  const [dataQualitySearch, setDataQualitySearch] = useState("");
  const [dataQuality, setDataQuality] = useState<string[]>(dataQualityAvailable);
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageTiers, setCoverageTiers] = useState<string[]>(coverageAvailable);
  const [riskLevels, setRiskLevels] = useState<string[]>([]);
  const [signals, setSignals] = useState<string[]>([]);
  const [manualReturnIds, setManualReturnIds] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState("");
  const [riskLevelSearch, setRiskLevelSearch] = useState("");
  const [riskSignalSearch, setRiskSignalSearch] = useState("");
  const [funnelMode, setFunnelMode] = useState("all");
  const [funnelPercentage, setFunnelPercentage] = useState("10");
  const [funnelFixedCount, setFunnelFixedCount] = useState("200");
  const [funnelMinimum, setFunnelMinimum] = useState("200");
  const [funnelMaximum, setFunnelMaximum] = useState("2000");
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPerPage, setPreviewPerPage] = useState(10);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewSignalFilter, setPreviewSignalFilter] = useState("all");
  const [previewSort, setPreviewSort] = useState("mismatch-desc");
  const [previewView, setPreviewView] = useState<"list" | "comparison">("list");
  const [screeningRun, setScreeningRun] = useState<ScreeningRunRecord | null>(null);
  const [screeningClock, setScreeningClock] = useState(() => Date.now());
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPerPage, setReviewPerPage] = useState(10);
  const [explanation, setExplanation] = useState<AuditExplanation | null>(null);

  const activeSteps = TRACK_STEPS[track];
  const activeStepId = activeSteps[step] ?? activeSteps[activeSteps.length - 1];

  const baseYearRows = useMemo(
    () => ALL_TAXPAYER_ROWS.filter((row) => String(row.assessment_year) === assessmentYear),
    [assessmentYear],
  );

  const circleOptions = useMemo<CircleScopeOption[]>(() => {
    if (zone !== ALL_ZONES_VALUE) {
      return getVerifiedCirclesForZone(zone).map((circle) => ({
        value: circleScopeValue(zone, circle),
        label: circle,
        zone,
        circle,
      }));
    }

    return Object.values(VERIFIED_TAX_JURISDICTIONS)
      .flatMap((jurisdiction) => jurisdiction.circles.map((circle) => ({
        value: circleScopeValue(jurisdiction.zone, circle),
        label: `${circle} · ${jurisdiction.zone}`,
        zone: jurisdiction.zone,
        circle,
      })))
      .sort((a,b) => a.label.localeCompare(b.label));
  }, [zone]);

  const verifiedCircleMappingAvailable = circleOptions.length > 0;

  const selectedCircleLabels = useMemo(
    () => circleOptions.filter((option) => circles.includes(option.value)).map((option) => option.label),
    [circleOptions, circles],
  );

  const populationRows = useMemo(() => {
    if (scopeMode !== "selected") {
      if (zone === ALL_ZONES_VALUE || circleOptions.length === 0) {
        return baseYearRows.map((row) => ({
          ...row,
          zone: zone === ALL_ZONES_VALUE ? "All Zones" : zone,
          circle: "—",
          representative_record: true,
        }));
      }

      return baseYearRows.map((row, index) => {
        const assignment = circleOptions[index % circleOptions.length];
        return {
          ...row,
          zone: assignment.zone,
          circle: assignment.circle,
          circle_scope_value: assignment.value,
          representative_record: true,
        };
      });
    }

    if (circles.length === 0 || circleOptions.length === 0) return [];

    const selected = new Set(circles);
    return baseYearRows
      .map((row, index) => {
        const assignment = circleOptions[index % circleOptions.length];
        return {
          ...row,
          zone: assignment.zone,
          circle: assignment.circle,
          circle_scope_value: assignment.value,
          representative_record: true,
        };
      })
      .filter((row) => selected.has(String(row.circle_scope_value)));
  }, [baseYearRows, zone, scopeMode, circles, circleOptions]);

  const filteredCircleOptions = useMemo(() => {
    const needle = circleSearch.trim().toLowerCase();
    if (!needle) return circleOptions;
    return circleOptions.filter((option) =>
      option.label.toLowerCase().includes(needle)
      || option.zone.toLowerCase().includes(needle)
      || option.circle.toLowerCase().includes(needle)
    );
  }, [circleSearch, circleOptions]);

  const filteredDataQuality = useMemo(() => {
    const needle = dataQualitySearch.trim().toLowerCase();
    if (!needle) return dataQualityAvailable;
    return dataQualityAvailable.filter((value) => value.toLowerCase().includes(needle));
  }, [dataQualitySearch, dataQualityAvailable]);

  const filteredCoverageTiers = useMemo(() => {
    const needle = coverageSearch.trim().toLowerCase();
    if (!needle) return coverageAvailable;
    return coverageAvailable.filter((tier) => tier.toLowerCase().includes(needle));
  }, [coverageSearch, coverageAvailable]);

  const readinessRows = useMemo(() => populationRows.filter((row) =>
    dataQuality.includes(String(row.data_quality)) &&
    coverageTiers.includes(String(row.coverage_tier))
  ), [populationRows, dataQuality, coverageTiers]);

  const alreadyInAuditRows = useMemo(() => readinessRows.filter((row) =>
    String(row.audit_state ?? "Not Started") !== "Not Started"
  ), [readinessRows]);

  const selectableRows = useMemo(() => readinessRows.filter((row) =>
    String(row.audit_state ?? "Not Started") === "Not Started"
  ), [readinessRows]);

  const modeledPopulationCount = useMemo(() => {
    const zoneEstimate = NBR_REPORTED_ERETURN_MIN_2025_26 / Math.max(1, TAX_ZONES.length);

    if (scopeMode === "selected" && circles.length > 0) {
      const selectedOptions = circleOptions.filter((option) => circles.includes(option.value));
      const selectedByZone = new Map<string, number>();
      selectedOptions.forEach((option) => {
        selectedByZone.set(option.zone, (selectedByZone.get(option.zone) ?? 0) + 1);
      });

      return Array.from(selectedByZone.entries()).reduce((total, [selectedZone, selectedCount]) => {
        const verifiedTotal = Math.max(1, getVerifiedCirclesForZone(selectedZone).length);
        return total + zoneEstimate * (selectedCount / verifiedTotal);
      }, 0);
    }

    if (zone === ALL_ZONES_VALUE) return NBR_REPORTED_ERETURN_MIN_2025_26;
    return zoneEstimate;
  }, [zone, scopeMode, circles, circleOptions]);

  const modelFromRepresentative = (sampleCount: number) => {
    const denominator = Math.max(1, populationRows.length);
    return modeledPopulationCount * (sampleCount / denominator);
  };

  const modeledReadinessCount = modelFromRepresentative(readinessRows.length);
  const modeledAlreadyInAuditCount = modelFromRepresentative(alreadyInAuditRows.length);
  const modeledAvailableCount = modelFromRepresentative(selectableRows.length);

  const criteriaMatchedRows = useMemo(() => readinessRows.filter((row) => {
    if (track === "population") return true;

    if (track === "risk") {
      if (riskLevels.length === 0 && signals.length === 0) return false;
      const riskOk = riskLevels.length === 0 || riskLevels.includes(String(row.risk_level));
      const rowSignals = signalIds(row.signals);
      const signalOk = signals.length === 0
        ? true
        : signals.some((id) => rowSignals.includes(id));
      return riskOk && signalOk;
    }

    if (track === "manual") {
      return manualReturnIds.includes(String(row.return_id));
    }

    return false;
  }), [readinessRows, track, riskLevels, signals, manualReturnIds]);

  const matchedRows = useMemo(
    () => criteriaMatchedRows.filter((row) => String(row.audit_state ?? "Not Started") === "Not Started"),
    [criteriaMatchedRows],
  );

  const matchedAlreadyInAuditRows = useMemo(
    () => criteriaMatchedRows.filter((row) => String(row.audit_state ?? "Not Started") !== "Not Started"),
    [criteriaMatchedRows],
  );

  const previewRows = criteriaMatchedRows;

  const screeningRunSignature = useMemo(() => JSON.stringify({
    assessmentYear,
    track,
    zone,
    scopeMode,
    circles:[...circles].sort(),
    dataQuality:[...dataQuality].sort(),
    coverageTiers:[...coverageTiers].sort(),
    riskLevels:[...riskLevels].sort(),
    signals:[...signals].sort(),
  }), [
    assessmentYear,
    track,
    zone,
    scopeMode,
    circles,
    dataQuality,
    coverageTiers,
    riskLevels,
    signals,
  ]);

  const activeScreeningRun = screeningRun?.signature === screeningRunSignature
    ? screeningRun
    : null;
  const screeningRunReady = Boolean(
    activeScreeningRun && screeningClock >= activeScreeningRun.readyAt
  );
  const screeningRunStatus: "idle" | "processing" | "ready" = !activeScreeningRun
    ? "idle"
    : screeningRunReady
      ? "ready"
      : "processing";

  useEffect(() => {
    if (screeningRunStatus !== "processing") return;
    const timer = window.setInterval(() => setScreeningClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [screeningRunStatus]);

  const previewSignalOptions = useMemo(() => {
    const counts = new Map<string, number>();
    previewRows.forEach((row) => {
      signalIds(row.signals).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return Array.from(counts.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [previewRows]);

  const effectivePreviewSignalFilter = previewSignalFilter === "all"
    || previewSignalOptions.some(([id]) => id === previewSignalFilter)
      ? previewSignalFilter
      : "all";

  const previewDisplayRows = useMemo(() => {
    const needle = previewSearch.trim().toLowerCase();
    const filtered = previewRows.filter((row) => {
      const rowSignals = signalIds(row.signals);
      const signalMatch = effectivePreviewSignalFilter === "all"
        || rowSignals.includes(effectivePreviewSignalFilter);
      const searchMatch = !needle || [
        row.taxpayer_name,
        row.tin,
        row.return_id,
        row.circle,
        row.risk_level,
        row.signals,
      ].some((value) => String(value ?? "").toLowerCase().includes(needle));
      return signalMatch && searchMatch;
    });

    return [...filtered].sort((a,b) => {
      if (previewSort === "signals-desc") {
        return signalIds(b.signals).length - signalIds(a.signals).length
          || candidateMismatchAmount(b) - candidateMismatchAmount(a);
      }
      if (previewSort === "risk-desc") {
        return (RISK_PRIORITY[String(b.risk_level)] ?? 0) - (RISK_PRIORITY[String(a.risk_level)] ?? 0)
          || candidateMismatchAmount(b) - candidateMismatchAmount(a);
      }
      if (previewSort === "name-asc") {
        return String(a.taxpayer_name ?? "").localeCompare(String(b.taxpayer_name ?? ""));
      }
      return candidateMismatchAmount(b) - candidateMismatchAmount(a);
    });
  }, [
    previewRows,
    previewSearch,
    effectivePreviewSignalFilter,
    previewSort,
  ]);

  const previewDisplayMismatchMax = useMemo(
    () => Math.max(0, ...previewDisplayRows.map(candidateMismatchAmount)),
    [previewDisplayRows],
  );

  const safePreviewPage = Math.min(
    previewPage,
    Math.max(1, Math.ceil(previewDisplayRows.length / previewPerPage)),
  );
  const previewPageRows = previewDisplayRows.slice(
    (safePreviewPage - 1) * previewPerPage,
    safePreviewPage * previewPerPage,
  );

  const funnelTargetCount = useMemo(() => {
    const available = matchedRows.length;
    if (available === 0 || funnelMode === "all") return available;

    const percentage = Number(funnelPercentage);
    const fixedCount = Number(funnelFixedCount);
    const minimum = Number(funnelMinimum);
    const maximum = Number(funnelMaximum);

    if (funnelMode === "percentage") {
      const target = Number.isFinite(percentage) ? Math.ceil(available * percentage / 100) : 0;
      return Math.min(available, Math.max(0, target));
    }

    if (funnelMode === "fixed") {
      const target = Number.isFinite(fixedCount) ? Math.floor(fixedCount) : 0;
      return Math.min(available, Math.max(0, target));
    }

    const base = Number.isFinite(percentage) ? Math.ceil(available * percentage / 100) : 0;
    const minValue = Number.isFinite(minimum) ? Math.max(0, Math.floor(minimum)) : 0;
    const maxValue = Number.isFinite(maximum) ? Math.max(0, Math.floor(maximum)) : available;
    const bounded = Math.min(Math.max(base, minValue), maxValue);
    return Math.min(available, Math.max(0, bounded));
  }, [matchedRows.length, funnelMode, funnelPercentage, funnelFixedCount, funnelMinimum, funnelMaximum]);

  const funnelRows = useMemo(
    () => matchedRows.slice(0, funnelTargetCount),
    [matchedRows, funnelTargetCount],
  );

  const finalRows = funnelRows;
  const safeReviewPage = Math.min(
    reviewPage,
    Math.max(1, Math.ceil(finalRows.length / reviewPerPage)),
  );
  const reviewPageRows = finalRows.slice(
    (safeReviewPage - 1) * reviewPerPage,
    safeReviewPage * reviewPerPage,
  );

  const manualRows = useMemo(() => {
    const needle = manualSearch.trim().toLowerCase();
    return readinessRows.filter((row) => !needle || [
      row.taxpayer_name, row.tin, row.return_id, row.circle, row.audit_state,
    ].some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [readinessRows, manualSearch]);

  const filteredRiskLevels = useMemo(() => {
    const needle = riskLevelSearch.trim().toLowerCase();
    if (!needle) return RISK_LEVELS;
    return RISK_LEVELS.filter((level) => level.toLowerCase().includes(needle));
  }, [riskLevelSearch]);

  const filteredSignalOptions = useMemo(() => {
    const needle = riskSignalSearch.trim().toLowerCase();
    if (!needle) return SIGNAL_OPTIONS;
    return SIGNAL_OPTIONS.filter(([id, label]) =>
      id.toLowerCase().includes(needle) || label.toLowerCase().includes(needle)
    );
  }, [riskSignalSearch]);

  const stepValid = useMemo(() => {
    switch (activeStepId) {
      case "setup":
        return !!assessmentYear && !!track;
      case "population":
        return scopeMode === "all"
          || (verifiedCircleMappingAvailable && circles.length > 0);
      case "readiness":
        return dataQuality.length > 0 && coverageTiers.length > 0;
      case "riskCriteria":
        return riskLevels.length > 0 || signals.length > 0;
      case "manualSelection":
        return manualReturnIds.length > 0;
      case "screeningRun":
        return screeningRunReady;
      case "funnel": {
        if (matchedRows.length === 0) return false;
        const percentage = Number(funnelPercentage);
        const fixedCount = Number(funnelFixedCount);
        const minimum = Number(funnelMinimum);
        const maximum = Number(funnelMaximum);
        if (funnelMode === "all") return true;
        if (funnelMode === "percentage") return percentage > 0 && percentage <= 100;
        if (funnelMode === "fixed") return fixedCount > 0;
        return percentage > 0 && percentage <= 100 && minimum >= 0 && maximum > 0 && maximum >= minimum;
      }
      case "preview":
        return matchedRows.length > 0;
      case "review":
        return finalRows.length > 0;
      default:
        return false;
    }
  }, [activeStepId, assessmentYear, track, scopeMode, verifiedCircleMappingAvailable, circles, dataQuality, coverageTiers, riskLevels, signals, manualReturnIds, matchedRows.length, previewRows.length, screeningRunReady, funnelMode, funnelPercentage, funnelFixedCount, funnelMinimum, funnelMaximum, finalRows]);


  const explain = (key: string, value: string, row: TableRow) => {
    const resolved = resolveAuditExplanation(key, value, row, i18n.resolvedLanguage);
    if (resolved) setExplanation(resolved);
  };

  const closeFreshSession = () => {
    setScreeningRun(null);
    setExplanation(null);
    try {
      window.localStorage.removeItem(SCREENING_RUN_STORAGE_KEY);
    } catch {
      // Closing the modal must still reset the in-memory wizard state.
    }
    onClose();
  };

  const startScreeningRun = () => {
    const startedAt = Date.now();
    const nextRun: ScreeningRunRecord = {
      signature: screeningRunSignature,
      startedAt,
      readyAt: startedAt + SCREENING_READY_AFTER_MS,
      snapshot: {
        assessmentYear,
        zone,
        scopeMode,
        circles:[...circles],
        dataQuality:[...dataQuality],
        coverageTiers:[...coverageTiers],
        riskLevels:[...riskLevels],
        signals:[...signals],
      },
    };
    setScreeningRun(nextRun);
    setScreeningClock(startedAt);
    try {
      window.localStorage.setItem(SCREENING_RUN_STORAGE_KEY, JSON.stringify(nextRun));
    } catch {
      // The current modal state still tracks the run if storage is unavailable.
    }
    toast.success(t("initiate.screening.toastStarted"));
  };

  const completePrototypeScreening = () => {
    const now = Date.now();
    const currentRun = activeScreeningRun ?? screeningRun;

    if (currentRun) {
      const completedRun: ScreeningRunRecord = {
        ...currentRun,
        readyAt: now,
      };
      setScreeningRun(completedRun);
      setScreeningClock(now);
      try {
        window.localStorage.setItem(SCREENING_RUN_STORAGE_KEY, JSON.stringify(completedRun));
      } catch {
        // The prototype can still continue if storage is unavailable.
      }
    }

    setMaxCompletedStep((value) => Math.max(value, step));
    setStep((value) => Math.min(activeSteps.length - 1, value + 1));
  };

  const handleZoneChange = (value: string) => {
    setZone(value);
    setScopeMode("all");
    setCircles([]);
    setCircleSearch("");
    setManualReturnIds([]);
    setPreviewPage(1);
    setPreviewSearch("");
    setPreviewSignalFilter("all");
    setPreviewSort("mismatch-desc");
    setPreviewView("list");
    setReviewPage(1);
  };

  const handleTrackSelect = (value: string) => {
    const nextTrack = value as TrackId;
    if (nextTrack === track) return;

    setTrack(nextTrack);
    setStep(0);
    setMaxCompletedStep(-1);
    setRiskLevels([]);
    setSignals([]);
    setManualReturnIds([]);
    setManualSearch("");
    setRiskLevelSearch("");
    setRiskSignalSearch("");
    setFunnelMode("all");
    setFunnelPercentage("10");
    setFunnelFixedCount("200");
    setFunnelMinimum("200");
    setFunnelMaximum("2000");
    setPreviewPage(1);
    setPreviewSearch("");
    setPreviewSignalFilter("all");
    setPreviewSort("mismatch-desc");
    setPreviewView("list");
    setReviewPage(1);
  };

  const funnelBasis = useMemo(() => {
    if (funnelMode === "all") return t("initiate.funnel.modes.all.title");
    if (funnelMode === "percentage") return t("initiate.funnel.basis.percentage", { percentage:funnelPercentage });
    if (funnelMode === "fixed") return t("initiate.funnel.basis.fixed", { count:funnelFixedCount });
    return t("initiate.funnel.basis.limited", {
      percentage:funnelPercentage,
      minimum:funnelMinimum,
      maximum:funnelMaximum,
    });
  }, [funnelMode, funnelPercentage, funnelFixedCount, funnelMinimum, funnelMaximum, t]);

  const selectionBasis = useMemo(() => {
    const zoneLabel = zone === ALL_ZONES_VALUE ? t("initiate.summary.allZones") : zone;
    const scope = scopeMode === "all" ? t("initiate.summary.allCircles") : selectedCircleLabels.join(", ");
    if (track === "population") return `Population selection · ${zoneLabel} · ${scope} · ${funnelBasis}`;
    if (track === "risk") {
      const parts = [
        riskLevels.length ? `Risk: ${riskLevels.join(", ")}` : "",
        signals.length ? `Signals: ${signals.join(", ")}` : "",
      ].filter(Boolean).join(" · ");
      return `Risk-based · ${zoneLabel} · ${scope} · ${parts} · ${funnelBasis}`;
    }
    return `Manual selection · ${zoneLabel} · ${scope} · ${funnelBasis}`;
  }, [zone, scopeMode, selectedCircleLabels, track, riskLevels, signals, funnelBasis, t]);

  const modeledMatchedCount = modelFromRepresentative(matchedRows.length);
  const modeledFinalCount = matchedRows.length > 0
    ? modeledMatchedCount * (finalRows.length / matchedRows.length)
    : 0;

  const confirmCandidates = async () => {
    if (!finalRows.length) return;
    try {
    await saveAuditCandidates(finalRows, {
      assessmentYear,
      track: t(TRACKS.find((item) => item.id === track)?.titleKey ?? "initiate.tracks.risk.title"),
      selectionBasis,
      funnelRule: funnelBasis,
      zone: zone === ALL_ZONES_VALUE ? t("initiate.summary.allZones") : zone,
      populationConsidered: clampCount(modeledPopulationCount),
      eligibleAfterReadiness: clampCount(modeledReadinessCount),
      matchedCriteria: clampCount(modeledMatchedCount),
      afterPreview: matchedRows.length,
      finalCandidates: clampCount(modeledFinalCount),
    });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Candidate confirmation could not be verified");
      return;
    }
    toast.success(t("initiate.toast.candidatesConfirmed", { count: finalRows.length }));
    if (track === "risk") {
      setScreeningRun(null);
      try {
        window.localStorage.removeItem(SCREENING_RUN_STORAGE_KEY);
      } catch {
        // Candidate confirmation is still complete if storage is unavailable.
      }
    }
    onConfirmed();
    closeFreshSession();
  };

  const populationStepIndex = activeSteps.indexOf("population");
  const readinessStepIndex = activeSteps.indexOf("readiness");
  const criteriaStepIndex = activeSteps.findIndex((id) =>
    id === "riskCriteria" || id === "manualSelection"
  );
  const screeningRunStepIndex = activeSteps.indexOf("screeningRun");
  const matchedStepIndex = screeningRunStepIndex >= 0
    ? screeningRunStepIndex
    : criteriaStepIndex >= 0
      ? criteriaStepIndex
      : readinessStepIndex;
  const funnelStepIndex = activeSteps.indexOf("funnel");

  const impactValue = (
    requiredCompletedStep: number,
    value: number,
    options: { nationalFloor?: boolean } = {},
  ): string =>
    requiredCompletedStep >= 0 && maxCompletedStep >= requiredCompletedStep
      ? options.nationalFloor
        ? `${new Intl.NumberFormat("en-US").format(clampCount(value))}+`
        : formatCount(value)
      : "—";

  useEffect(() => {
    if (!screeningRunReady || screeningRunStepIndex < 0) return;
    setMaxCompletedStep((value) => Math.max(value, screeningRunStepIndex));
  }, [screeningRunReady, screeningRunStepIndex]);

  const selectionImpactPanel = (
    <FormSection
      title={t("initiate.impact.title")}
      description={t("initiate.impact.description")}
    >
      <dl className="form-summary-list form-summary-list--compact">
        {[
          {
            label:t("initiate.summary.population"),
            value:impactValue(
              populationStepIndex,
              modeledPopulationCount,
              { nationalFloor: zone === ALL_ZONES_VALUE && scopeMode === "all" },
            ),
            help:t("initiate.impact.populationHelp"),
          },
          {
            label:t("initiate.summary.eligibleAfterReadiness"),
            value:impactValue(readinessStepIndex, modeledReadinessCount),
            help:t("initiate.impact.eligibleHelp"),
          },
          {
            label:t("initiate.summary.excludedByReadiness"),
            value:impactValue(
              readinessStepIndex,
              Math.max(0, modeledPopulationCount - modeledReadinessCount),
            ),
            help:t("initiate.impact.excludedHelp"),
          },
          {
            label:t("initiate.summary.alreadyInAudit"),
            value:impactValue(readinessStepIndex, modeledAlreadyInAuditCount),
            help:t("initiate.impact.alreadyInAuditHelp"),
          },
          {
            label:t("initiate.summary.available"),
            value:impactValue(readinessStepIndex, modeledAvailableCount),
            help:t("initiate.impact.availableHelp"),
          },
          {
            label:t("initiate.summary.matchedCriteria"),
            value:impactValue(matchedStepIndex, modeledMatchedCount),
            help:t("initiate.impact.matchedHelp"),
          },
          {
            label:t("initiate.summary.finalCandidates"),
            value:activeStepId === "funnel"
              ? formatCount(modeledFinalCount)
              : impactValue(funnelStepIndex, modeledFinalCount),
            help:t("initiate.impact.finalHelp"),
          },
        ].map(({ label, value }) => (
          <div className="form-summary-list__row" key={label}>
            <dt className="form-summary-list__label">{label}</dt>
            <dd className="form-summary-list__value">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="form-helper">{t("initiate.impact.reauditGuardrail")}</p>
    </FormSection>
  );

  const stepperSteps = activeSteps.map((id) => ({
    id,
    label: t(`initiate.stepLabels.${id}`),
  }));

  const renderStep = () => {
    if (activeStepId === "setup") {
      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.setup.title")}
            icon={ClipboardList}
          >
            <div className="entry-form__grid">
              <AppSelectField
                id="audit-assessment-year"
                label={t("initiate.fields.assessmentYear")}
                value={assessmentYear}
                onChange={setAssessmentYear}
                options={assessmentYears}
                sortOptions
                searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                required
              />
            </div>
          </FormSection>

          <FormSection title={t("initiate.fields.selectionTrack")} icon={FileSearch}>
            <div className="app-choice-grid app-choice-grid--fill-last">
              {TRACKS.map((item) => (
                <AppChoiceCard
                  key={item.id}
                  name="audit-track"
                  value={item.id}
                  title={t(item.titleKey)}
                  description={t(item.descKey)}
                  selected={track === item.id}
                  onSelect={handleTrackSelect}
                />
              ))}
            </div>
          </FormSection>
        </div>
      );
    }

    if (activeStepId === "population") {
      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.population.title")}
            icon={Users}
          >
            <div className="entry-form__grid">
              <TaxZoneSelectField
                id="audit-tax-zone"
                label={t("initiate.fields.zone")}
                value={zone}
                onChange={handleZoneChange}
                allOptionValue={ALL_ZONES_VALUE}
                allOptionLabel={t("initiate.summary.allZones")}
                compact
                sortOptions
                searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
              />
            </div>

            <div className="app-choice-grid">
              <AppChoiceCard
                name="circle-scope"
                value="all"
                title={t("initiate.scope.all.title")}
                description={t("initiate.scope.all.desc")}
                selected={scopeMode === "all"}
                onSelect={setScopeMode}
              />
              <AppChoiceCard
                name="circle-scope"
                value="selected"
                title={t("initiate.scope.selected.title")}
                description={t("initiate.scope.selected.desc")}
                selected={scopeMode === "selected"}
                onSelect={setScopeMode}
                disabled={!verifiedCircleMappingAvailable}
              />
            </div>

            {!verifiedCircleMappingAvailable && (
              <p className="form-helper">{t("initiate.scope.unverifiedCircles")}</p>
            )}
            {zone === ALL_ZONES_VALUE && verifiedCircleMappingAvailable && (
              <p className="form-helper">{t("initiate.scope.verifiedOnly")}</p>
            )}
          </FormSection>

          {scopeMode === "selected" && verifiedCircleMappingAvailable && (
            <FormSection title={t("initiate.fields.selectCircles")} icon={ListChecks}>
              <div className="form-section__toolbar">
                <div className="form-section__toolbar-search">
                  <AppSearchField
                    value={circleSearch}
                    onChange={setCircleSearch}
                    label={t("initiate.fields.searchCircles")}
                    placeholder={t("initiate.fields.searchCircles")}
                    size="compact"
                  />
                </div>
                <div className="form-section__toolbar-actions">
                  {circles.length < circleOptions.length && (
                    <SecondaryButton size="sm" onClick={() => setCircles(circleOptions.map((option) => option.value))}>
                      {t("initiate.actions.selectAll")}
                    </SecondaryButton>
                  )}
                  {circles.length > 0 && (
                    <SecondaryButton size="sm" onClick={() => setCircles([])}>
                      {t("initiate.actions.clear")}
                    </SecondaryButton>
                  )}
                </div>
              </div>

              {filteredCircleOptions.length > 0 ? (
                <div className="app-selection-grid">
                  {filteredCircleOptions.map((option) => (
                    <AppSelectionRow
                      key={option.value}
                      title={option.label}
                      checked={circles.includes(option.value)}
                      onChange={() => setCircles(toggle(circles, option.value))}
                      onInfo={() => explain("circle", option.circle, { circle:option.circle, zone:option.zone })}
                      infoLabel={t("initiate.explain", { value: option.label })}
                    />
                  ))}
                </div>
              ) : (
                <p className="form-helper">{t("initiate.validation.noCirclesFound")}</p>
              )}
            </FormSection>
          )}
        </div>
      );
    }

    if (activeStepId === "readiness") {
      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.readiness.title")}
            icon={Database}
          >
            <div className="form-section-grid">
              <section className="form-subsection form-subsection--boxed">
                <div className="form-subsection__heading">
                  <h4 className="form-subsection__title">{t("initiate.fields.dataQuality")}</h4>
                </div>
                <div className="form-section__toolbar">
                  <div className="form-section__toolbar-search">
                    <AppSearchField
                      value={dataQualitySearch}
                      onChange={setDataQualitySearch}
                      label={t("initiate.fields.searchDataQuality")}
                      placeholder={t("initiate.fields.searchDataQuality")}
                      size="compact"
                    />
                  </div>
                  <div className="form-section__toolbar-actions">
                    {dataQuality.length < dataQualityAvailable.length && (
                      <SecondaryButton size="sm" onClick={() => setDataQuality(dataQualityAvailable)}>
                        {t("initiate.actions.selectAll")}
                      </SecondaryButton>
                    )}
                    {dataQuality.length > 0 && (
                      <SecondaryButton size="sm" onClick={() => setDataQuality([])}>
                        {t("initiate.actions.clear")}
                      </SecondaryButton>
                    )}
                  </div>
                </div>
                <div className="app-selection-stack">
                  {filteredDataQuality.map((quality) => (
                    <AppSelectionRow
                      key={quality}
                      title={quality}
                      checked={dataQuality.includes(quality)}
                      onChange={() => setDataQuality(toggle(dataQuality, quality))}
                      onInfo={() => explain("data_quality", quality, { data_quality:quality })}
                      infoLabel={t("initiate.explain", { value: quality })}
                    />
                  ))}
                </div>
              </section>

              <section className="form-subsection form-subsection--boxed">
                <div className="form-subsection__heading">
                  <h4 className="form-subsection__title">{t("initiate.fields.coverageTier")}</h4>
                </div>
                <div className="form-section__toolbar">
                  <div className="form-section__toolbar-search">
                    <AppSearchField
                      value={coverageSearch}
                      onChange={setCoverageSearch}
                      label={t("initiate.fields.searchCoverageTier")}
                      placeholder={t("initiate.fields.searchCoverageTier")}
                      size="compact"
                    />
                  </div>
                  <div className="form-section__toolbar-actions">
                    {coverageTiers.length < coverageAvailable.length && (
                      <SecondaryButton size="sm" onClick={() => setCoverageTiers(coverageAvailable)}>
                        {t("initiate.actions.selectAll")}
                      </SecondaryButton>
                    )}
                    {coverageTiers.length > 0 && (
                      <SecondaryButton size="sm" onClick={() => setCoverageTiers([])}>
                        {t("initiate.actions.clear")}
                      </SecondaryButton>
                    )}
                  </div>
                </div>
                <div className="app-selection-stack">
                  {filteredCoverageTiers.map((tier) => (
                    <AppSelectionRow
                      key={tier}
                      title={tier}
                      checked={coverageTiers.includes(tier)}
                      onChange={() => setCoverageTiers(toggle(coverageTiers, tier))}
                      onInfo={() => explain("coverage_tier", tier, { coverage_tier:tier })}
                      infoLabel={t("initiate.explain", { value: tier })}
                    />
                  ))}
                </div>
              </section>
            </div>
          </FormSection>
        </div>
      );
    }

    if (activeStepId === "riskCriteria") {
      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.riskCriteria.title")}
            icon={FileSearch}
          >
            <div className="form-stack">
              <section className="form-subsection">
                <div className="form-subsection__heading">
                  <h4 className="form-subsection__title">{t("initiate.fields.riskLevel")}</h4>
                </div>
                <div className="form-section__toolbar">
                  <div className="form-section__toolbar-search">
                    <AppSearchField
                      value={riskLevelSearch}
                      onChange={setRiskLevelSearch}
                      label={t("initiate.fields.searchRiskLevel")}
                      placeholder={t("initiate.fields.searchRiskLevel")}
                      size="compact"
                    />
                  </div>
                  <div className="form-section__toolbar-actions">
                    {riskLevels.length < RISK_LEVELS.length && (
                      <SecondaryButton size="sm" onClick={() => setRiskLevels([...RISK_LEVELS])}>
                        {t("initiate.actions.selectAll")}
                      </SecondaryButton>
                    )}
                    {riskLevels.length > 0 && (
                      <SecondaryButton size="sm" onClick={() => setRiskLevels([])}>
                        {t("initiate.actions.clear")}
                      </SecondaryButton>
                    )}
                  </div>
                </div>
                {filteredRiskLevels.length > 0 ? (
                  <div className="app-selection-grid">
                    {filteredRiskLevels.map((level) => (
                      <AppSelectionRow
                        key={level}
                        title={level}
                        checked={riskLevels.includes(level)}
                        onChange={() => setRiskLevels(toggle(riskLevels, level))}
                        onInfo={() => explain("risk_level", level, { risk_level:level })}
                        infoLabel={t("initiate.explain", { value: level })}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="form-helper">{t("initiate.validation.noResults")}</p>
                )}
              </section>

              <section className="form-subsection">
                <div className="form-subsection__heading">
                  <h4 className="form-subsection__title">{t("initiate.fields.riskSignals")}</h4>
                </div>
                <div className="form-section__toolbar">
                  <div className="form-section__toolbar-search">
                    <AppSearchField
                      value={riskSignalSearch}
                      onChange={setRiskSignalSearch}
                      label={t("initiate.riskSignals.searchLabel")}
                      placeholder={t("initiate.riskSignals.searchPlaceholder")}
                      size="compact"
                    />
                  </div>
                  <div className="form-section__toolbar-actions">
                    {signals.length < SIGNAL_OPTIONS.length && (
                      <SecondaryButton size="sm" onClick={() => setSignals(SIGNAL_OPTIONS.map(([id]) => id))}>
                        {t("initiate.actions.selectAll")}
                      </SecondaryButton>
                    )}
                    {signals.length > 0 && (
                      <SecondaryButton size="sm" onClick={() => setSignals([])}>
                        {t("initiate.actions.clear")}
                      </SecondaryButton>
                    )}
                  </div>
                </div>
                <p className="form-helper">
                  {t("initiate.riskSignals.selectedCount", { count: signals.length })}
                </p>
                {filteredSignalOptions.length > 0 ? (
                  <div className="app-selection-grid">
                    {filteredSignalOptions.map(([id,label]) => (
                      <AppSelectionRow
                        key={id}
                        code={id}
                        title={label}
                        checked={signals.includes(id)}
                        onChange={() => setSignals(toggle(signals, id))}
                        onInfo={() => explain("rule_id", id, { rule_id:id })}
                        infoLabel={t("initiate.explain", { value: id })}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="form-helper">{t("initiate.riskSignals.noResults")}</p>
                )}
              </section>


            </div>
          </FormSection>
        </div>
      );
    }

    if (activeStepId === "manualSelection") {
      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.manualSelection.title")}
            icon={FileSearch}
          >
            <section className="form-subsection">
              <div className="form-subsection__heading">
                <h4 className="form-subsection__title">{t("initiate.fields.manualTaxpayers")}</h4>
              </div>
              <AppSearchField
                value={manualSearch}
                onChange={setManualSearch}
                label={t("initiate.fields.searchTaxpayer")}
                placeholder={t("initiate.fields.searchTaxpayer")}
                size="standard"
              />
              <div className="app-selection-stack">
                {manualRows.map((row) => {
                  const returnId=String(row.return_id);
                  const alreadyInAudit = String(row.audit_state ?? "Not Started") !== "Not Started";
                  return (
                    <AppSelectionRow
                      key={returnId}
                      title={String(row.taxpayer_name)}
                      description={[
                        String(row.tin),
                        returnId,
                        String(row.circle),
                        alreadyInAudit
                          ? t("initiate.previewDecision.alreadyInAuditState", { state:String(row.audit_state) })
                          : "",
                      ].filter(Boolean).join(" · ")}
                      checked={!alreadyInAudit && manualReturnIds.includes(returnId)}
                      disabled={alreadyInAudit}
                      onChange={() => {
                        if (!alreadyInAudit) setManualReturnIds(toggle(manualReturnIds, returnId));
                      }}
                    />
                  );
                })}
              </div>
            </section>
          </FormSection>
        </div>
      );
    }

    if (activeStepId === "funnel") {
      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.funnel.title")}
            icon={Users}
          >
            <div className="app-choice-grid">
              {[
                ["all", "initiate.funnel.modes.all.title", "initiate.funnel.modes.all.desc"],
                ["percentage", "initiate.funnel.modes.percentage.title", "initiate.funnel.modes.percentage.desc"],
                ["fixed", "initiate.funnel.modes.fixed.title", "initiate.funnel.modes.fixed.desc"],
                ["limited", "initiate.funnel.modes.limited.title", "initiate.funnel.modes.limited.desc"],
              ].map(([value,titleKey,descKey]) => (
                <AppChoiceCard
                  key={value}
                  name="funnel-mode"
                  value={value}
                  title={t(titleKey)}
                  description={t(descKey)}
                  selected={funnelMode === value}
                  onSelect={setFunnelMode}
                />
              ))}
            </div>

            {funnelMode !== "all" && (
              <section className="form-subsection">
                <div className="entry-form__grid">
                  {(funnelMode === "percentage" || funnelMode === "limited") && (
                    <AppNumberField
                      id="audit-funnel-percentage"
                      label={t("initiate.funnel.fields.percentage")}
                      value={funnelPercentage}
                      onChange={setFunnelPercentage}
                      min={1}
                      max={100}
                      step={1}
                      required
                      helper={t("initiate.funnel.helpers.percentage")}
                    />
                  )}
                  {funnelMode === "fixed" && (
                    <AppNumberField
                      id="audit-funnel-fixed"
                      label={t("initiate.funnel.fields.fixedCount")}
                      value={funnelFixedCount}
                      onChange={setFunnelFixedCount}
                      min={1}
                      step={1}
                      required
                    />
                  )}
                  {funnelMode === "limited" && (
                    <>
                      <AppNumberField
                        id="audit-funnel-minimum"
                        label={t("initiate.funnel.fields.minimum")}
                        value={funnelMinimum}
                        onChange={setFunnelMinimum}
                        min={0}
                        step={1}
                        required
                      />
                      <AppNumberField
                        id="audit-funnel-maximum"
                        label={t("initiate.funnel.fields.maximum")}
                        value={funnelMaximum}
                        onChange={setFunnelMaximum}
                        min={1}
                        step={1}
                        required
                      />
                    </>
                  )}
                </div>
              </section>
            )}

          </FormSection>
        </div>
      );
    }

    if (activeStepId === "screeningRun") {
      const statusTitle = t(`initiate.screening.status.${screeningRunStatus}.title`);
      const statusDescription = t(`initiate.screening.status.${screeningRunStatus}.desc`);
      const statusLabel = t(`initiate.screening.status.${screeningRunStatus}.label`);

      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.screeningRun.title")}
            icon={Clock}
          >
            <div className={`audit-screening-run audit-screening-run--${screeningRunStatus}`}>
              <div className="audit-screening-run__status">
                <span className="audit-screening-run__icon" aria-hidden="true">
                  {screeningRunStatus === "ready"
                    ? <CheckCircle2 size={20} strokeWidth={2} />
                    : <Clock size={20} strokeWidth={2} />}
                </span>
                <div className="audit-screening-run__status-copy">
                  <h4>{statusTitle}</h4>
                  <p>{statusDescription}</p>
                </div>
                <span className="audit-screening-run__badge">{statusLabel}</span>
              </div>

              <div className="audit-screening-run__meta">
                <div>
                  <span>{t("initiate.screening.screenable")}</span>
                  <strong>{formatCount(modeledAvailableCount)}</strong>
                </div>
                <div>
                  <span>{t("initiate.screening.criteria")}</span>
                  <strong>
                    {t("initiate.screening.criteriaValue", {
                      levels:riskLevels.length,
                      signals:signals.length,
                    })}
                  </strong>
                </div>
                <div>
                  <span>{t("initiate.screening.expected")}</span>
                  <strong>{t("initiate.screening.duration")}</strong>
                </div>
                <div>
                  <span>{t("initiate.screening.started")}</span>
                  <strong>
                    {activeScreeningRun
                      ? formatScreeningTime(activeScreeningRun.startedAt, i18n.resolvedLanguage ?? "en")
                      : "—"}
                  </strong>
                </div>
              </div>

              <ol className="audit-screening-run__timeline" aria-label={t("initiate.screening.progressLabel")}>
                <li className="audit-screening-run__timeline-item audit-screening-run__timeline-item--done">
                  <span aria-hidden="true"><CheckCircle2 size={15} strokeWidth={2.2} /></span>
                  <strong>{t("initiate.screening.timeline.criteria")}</strong>
                </li>
                <li className={screeningRunStatus === "ready"
                  ? "audit-screening-run__timeline-item audit-screening-run__timeline-item--done"
                  : "audit-screening-run__timeline-item audit-screening-run__timeline-item--active"}>
                  <span aria-hidden="true">
                    {screeningRunStatus === "ready"
                      ? <CheckCircle2 size={15} strokeWidth={2.2} />
                      : <Clock size={15} strokeWidth={2.2} />}
                  </span>
                  <strong>{t("initiate.screening.timeline.screening")}</strong>
                </li>
                <li className={screeningRunStatus === "ready"
                  ? "audit-screening-run__timeline-item audit-screening-run__timeline-item--ready"
                  : "audit-screening-run__timeline-item"}>
                  <span aria-hidden="true">
                    {screeningRunStatus === "ready"
                      ? <CheckCircle2 size={15} strokeWidth={2.2} />
                      : <span className="audit-screening-run__timeline-dot" />}
                  </span>
                  <strong>{t("initiate.screening.timeline.preview")}</strong>
                </li>
              </ol>

              {screeningRunStatus === "processing" && (
                <div className="audit-screening-run__progress" aria-hidden="true">
                  <span />
                </div>
              )}

              <p className="form-helper audit-screening-run__note">
                {t(`initiate.screening.note.${screeningRunStatus}`)}
              </p>
            </div>
          </FormSection>
        </div>
      );
    }

    if (activeStepId === "preview") {
      const hasPreviewFilters = previewSearch.trim().length > 0
        || effectivePreviewSignalFilter !== "all";

      return (
        <div className="form-stack">
          <FormSection
            title={t("initiate.steps.preview.title")}
            icon={ListChecks}
          >
            <section className="form-subsection">
              <div className="audit-preview-heading-row">
                <div className="form-subsection__heading">
                  <h4 className="form-subsection__title">
                    {hasPreviewFilters
                      ? t("initiate.previewSummary.filteredList", {
                          filtered:previewDisplayRows.length,
                          total:previewRows.length,
                        })
                      : t("initiate.previewSummary.initialList", { count:previewRows.length })}
                  </h4>
                  <p className="form-helper">{t("initiate.previewDecision.guardrail")}</p>
                  <div className="audit-preview-eligibility-summary">
                    <span>{t("initiate.previewDecision.availableForSelection", { count:matchedRows.length })}</span>
                    {matchedAlreadyInAuditRows.length > 0 && (
                      <span className="audit-preview-eligibility-summary__locked">
                        {t("initiate.previewDecision.alreadyInAuditCount", { count:matchedAlreadyInAuditRows.length })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="audit-preview-controls">
                <AppSearchField
                  value={previewSearch}
                  onChange={(value) => {
                    setPreviewSearch(value);
                    setPreviewPage(1);
                  }}
                  label={t("initiate.previewDecision.search")}
                  placeholder={t("initiate.previewDecision.search")}
                  size="compact"
                />

                <AppSelectField
                  id="audit-preview-sort"
                  label=""
                  ariaLabel={t("initiate.previewDecision.sortLabel")}
                  value={previewSort}
                  onChange={(value) => {
                    setPreviewSort(value);
                    setPreviewPage(1);
                  }}
                  compact
                  sortOptions
                  searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                  options={[
                    { value:"mismatch-desc", label:t("initiate.previewDecision.sortMismatch") },
                    { value:"signals-desc", label:t("initiate.previewDecision.sortSignals") },
                    { value:"risk-desc", label:t("initiate.previewDecision.sortRisk") },
                    { value:"name-asc", label:t("initiate.previewDecision.sortName") },
                  ]}
                />
              </div>

              <div className="audit-preview-switches" aria-label={t("initiate.previewDecision.signalSwitchLabel")}>
                <button
                  type="button"
                  className={effectivePreviewSignalFilter === "all"
                    ? "audit-preview-chip audit-preview-chip--active"
                    : "audit-preview-chip"}
                  onClick={() => {
                    setPreviewSignalFilter("all");
                    setPreviewPage(1);
                  }}
                >
                  {t("initiate.previewDecision.allSignals")} <span>{previewRows.length}</span>
                </button>
                {previewSignalOptions.map(([id,count]) => (
                  <button
                    type="button"
                    key={id}
                    className={effectivePreviewSignalFilter === id
                      ? "audit-preview-chip audit-preview-chip--active"
                      : "audit-preview-chip"}
                    onClick={() => {
                      setPreviewSignalFilter(id);
                      setPreviewPage(1);
                    }}
                  >
                    {id} <span>{count}</span>
                  </button>
                ))}
              </div>

              <div
                className="audit-preview-view-tabs"
                role="tablist"
                aria-label={t("initiate.previewDecision.viewLabel")}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewView === "list"}
                  className={previewView === "list"
                    ? "audit-preview-view-tabs__button audit-preview-view-tabs__button--active"
                    : "audit-preview-view-tabs__button"}
                  onClick={() => setPreviewView("list")}
                >
                  {t("initiate.previewDecision.listView")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewView === "comparison"}
                  className={previewView === "comparison"
                    ? "audit-preview-view-tabs__button audit-preview-view-tabs__button--active"
                    : "audit-preview-view-tabs__button"}
                  onClick={() => setPreviewView("comparison")}
                >
                  {t("initiate.previewDecision.comparisonView")}
                </button>
              </div>

              {previewDisplayRows.length > 0 && previewView === "comparison" && (
                <div className="audit-preview-ranking">
                  <div className="audit-preview-ranking__header">
                    <div>
                      <h4>{t("initiate.previewDecision.comparisonTitle")}</h4>
                      <p>{t("initiate.previewDecision.comparisonDescription")}</p>
                    </div>
                    <span>{t("initiate.previewDecision.comparisonLegend")}</span>
                  </div>

                  <div className="audit-preview-ranking__rows">
                    {previewPageRows.map((row) => {
                      const rowSignals = signalIds(row.signals);
                      const mismatch = candidateMismatchAmount(row);
                      const width = mismatch <= 0
                        ? 0
                        : Math.max(3, Math.min(100, (mismatch / Math.max(1, previewDisplayMismatchMax)) * 100));
                      const alreadyInAudit = String(row.audit_state ?? "Not Started") !== "Not Started";
                      const detailRow = { ...row };

                      return (
                        <button
                          type="button"
                          key={String(row.return_id)}
                          className={alreadyInAudit
                            ? "audit-preview-ranking__row audit-preview-ranking__row--locked"
                            : "audit-preview-ranking__row"}
                          onClick={() => explain("candidate_record", String(row.taxpayer_name), detailRow)}
                        >
                          <span className="audit-preview-ranking__name">
                            <strong>{String(row.taxpayer_name)}</strong>
                            {alreadyInAudit && <small>{t("initiate.previewDecision.alreadyInAudit")}</small>}
                          </span>
                          <span className="audit-preview-ranking__track" aria-hidden="true">
                            <i style={{ width:`${width}%` }} />
                          </span>
                          <strong
                            className="audit-preview-ranking__amount"
                            title={formatPreviewMoneyFull(mismatch, i18n.resolvedLanguage ?? "en")}
                          >
                            {formatPreviewMoney(mismatch, i18n.resolvedLanguage ?? "en")}
                          </strong>
                          <span className="audit-preview-ranking__signals">
                            {t("initiate.previewDecision.signalCountShort", { count:rowSignals.length })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {previewView === "list" && (
                <div className="audit-preview-candidate-list">
                  {previewPageRows.map((row) => {
                    const id=String(row.return_id);
                    const rowSignals=signalIds(row.signals);
                    const mismatch=candidateMismatchAmount(row);
                    const alreadyInAudit = String(row.audit_state ?? "Not Started") !== "Not Started";
                    const detailRow = { ...row };
                    return (
                      <div
                        className={alreadyInAudit
                          ? "audit-preview-candidate audit-preview-candidate--locked"
                          : "audit-preview-candidate"}
                        key={id}
                      >
                        <div className="audit-preview-candidate__main">
                          <strong>{String(row.taxpayer_name)}</strong>
                          <span>
                            {[
                              String(row.tin),
                              String(row.circle),
                              String(row.coverage_tier),
                            ].filter(Boolean).join(" · ")}
                          </span>
                          <div className="audit-preview-candidate__signals">
                            {rowSignals.map((signal) => (
                              <span key={signal}>{signal}</span>
                            ))}
                            {alreadyInAudit && (
                              <span className="audit-preview-candidate__audit-lock">
                                {t("initiate.previewDecision.alreadyInAudit")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="audit-preview-candidate__metrics">
                          <div>
                            <span>{t("initiate.previewDecision.risk")}</span>
                            <strong>{String(row.risk_level)}</strong>
                          </div>
                          <div>
                            <span>{t("initiate.previewDecision.signals")}</span>
                            <strong>{rowSignals.length}</strong>
                          </div>
                          <div className="audit-preview-candidate__mismatch">
                            <span>{t("initiate.previewDecision.mismatch")}</span>
                            <strong title={formatPreviewMoneyFull(mismatch, i18n.resolvedLanguage ?? "en")}>
                              {formatPreviewMoney(mismatch, i18n.resolvedLanguage ?? "en")}
                            </strong>
                          </div>
                          <button
                            type="button"
                            className="audit-preview-candidate__info"
                            onClick={() => explain("candidate_record", String(row.taxpayer_name), detailRow)}
                            aria-label={t("initiate.previewInfo", { value:String(row.taxpayer_name) })}
                          >
                            <Info size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {previewDisplayRows.length === 0 && (
                <p className="form-helper">{t("initiate.previewDecision.noResults")}</p>
              )}

              <Pagination
                total={previewDisplayRows.length}
                page={safePreviewPage}
                perPage={previewPerPage}
                onPage={setPreviewPage}
                perPageOptions={[10, 25, 50]}
                onPerPageChange={(value) => {
                  setPreviewPerPage(value);
                  setPreviewPage(1);
                }}
                perPageLabel={t("initiate.previewSummary.rowsPerPage")}
              />
            </section>
          </FormSection>
        </div>
      );
    }

    return (
      <div className="form-stack">
        <CollapsibleFormSection
          title={t("initiate.review.scope")}
          icon={ClipboardList}
        >
          <dl className="form-summary-list">
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.fields.assessmentYear")}</dt>
              <dd className="form-summary-list__value">{assessmentYear}</dd>
            </div>
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.fields.selectionTrack")}</dt>
              <dd className="form-summary-list__value">{t(TRACKS.find((item)=>item.id===track)?.titleKey ?? "initiate.tracks.risk.title")}</dd>
            </div>
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.fields.zone")}</dt>
              <dd className="form-summary-list__value">{zone === ALL_ZONES_VALUE ? t("initiate.summary.allZones") : zone}</dd>
            </div>
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.fields.circleScope")}</dt>
              <dd className="form-summary-list__value">{scopeMode === "all" ? t("initiate.summary.allCircles") : selectedCircleLabels.join(", ")}</dd>
            </div>
          </dl>
        </CollapsibleFormSection>

        <CollapsibleFormSection
          title={t("initiate.review.criteria")}
          icon={FileSearch}
        >
          <dl className="form-summary-list">
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.fields.dataQuality")}</dt>
              <dd className="form-summary-list__value">{dataQuality.join(", ")}</dd>
            </div>
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.fields.coverageTier")}</dt>
              <dd className="form-summary-list__value">{coverageTiers.join(", ")}</dd>
            </div>
            {track === "risk" && (
              <>
                <div className="form-summary-list__row">
                  <dt className="form-summary-list__label">{t("initiate.fields.riskLevel")}</dt>
                  <dd className="form-summary-list__value">{riskLevels.join(", ") || "—"}</dd>
                </div>
                <div className="form-summary-list__row">
                  <dt className="form-summary-list__label">{t("initiate.fields.riskSignals")}</dt>
                  <dd className="form-summary-list__value">{signals.join(", ") || "—"}</dd>
                </div>
              </>
            )}
            <div className="form-summary-list__row">
              <dt className="form-summary-list__label">{t("initiate.review.funnelRule")}</dt>
              <dd className="form-summary-list__value">{funnelBasis}</dd>
            </div>
          </dl>
        </CollapsibleFormSection>

        <CollapsibleFormSection
          title={t("initiate.review.finalList", { count:finalRows.length })}
          icon={CheckCircle2}
        >
          <div className="app-selection-stack">
            {reviewPageRows.map((row) => {
              const id=String(row.return_id);
              const meta=[
                String(row.tin),
                String(row.circle),
                String(row.coverage_tier),
                String(row.signals),
                String(row.risk_level),
                String(row.control_flags),
              ].filter((value) => value && value !== "—").join(" · ");
              return (
                <AppSelectionRow
                  key={id}
                  title={String(row.taxpayer_name)}
                  description={meta}
                  selectionControl={false}
                  onInfo={() => explain("candidate_record", String(row.taxpayer_name), row)}
                  infoLabel={t("initiate.previewInfo", { value: String(row.taxpayer_name) })}
                />
              );
            })}
          </div>
          <Pagination
            total={finalRows.length}
            page={safeReviewPage}
            perPage={reviewPerPage}
            onPage={setReviewPage}
            perPageOptions={[10, 25, 50]}
            onPerPageChange={(value) => {
              setReviewPerPage(value);
              setReviewPage(1);
            }}
            perPageLabel={t("initiate.previewSummary.rowsPerPage")}
          />
        </CollapsibleFormSection>
      </div>
    );
  };

  const goToNextStep = () => {
    setMaxCompletedStep((value) => Math.max(value, step));
    setStep((value) => Math.min(activeSteps.length - 1, value + 1));
  };

  const modalFooter = activeStepId === "screeningRun" ? (
    <>
      {screeningRunStatus !== "processing" && step > 0 && (
        <SecondaryButton size="sm" onClick={() => setStep((value) => Math.max(0,value-1))}>
          {t("initiate.actions.back")}
        </SecondaryButton>
      )}

      {screeningRunStatus === "idle" && (
        <PrimaryButton size="sm" onClick={startScreeningRun}>
          {t("initiate.actions.startScreening")}
        </PrimaryButton>
      )}

      {screeningRunStatus === "processing" && (
        <PrimaryButton size="sm" onClick={completePrototypeScreening}>
          {t("initiate.actions.next")}
        </PrimaryButton>
      )}

      {screeningRunStatus === "ready" && (
        <PrimaryButton size="sm" onClick={goToNextStep}>
          {t("initiate.actions.continueToCandidatePreview")}
        </PrimaryButton>
      )}
    </>
  ) : (
    <>
      {step > 0 && (
        <SecondaryButton size="sm" onClick={() => setStep((value) => Math.max(0,value-1))}>
          {t("initiate.actions.back")}
        </SecondaryButton>
      )}
      {step < activeSteps.length - 1 ? (
        <PrimaryButton
          size="sm"
          disabled={!stepValid}
          onClick={goToNextStep}
        >
          {t("initiate.actions.continue")}
        </PrimaryButton>
      ) : (
        <PrimaryButton size="sm" disabled={!stepValid} onClick={confirmCandidates}>
          {t("initiate.actions.confirmCandidates")}
        </PrimaryButton>
      )}
    </>
  );

  return (
    <AppModal
      open={open}
      onClose={closeFreshSession}
      title={t("initiate.title")}
      icon={<ClipboardList size={17} strokeWidth={1.8} />}
      size="xxxl"
      footer={modalFooter}
    >
      <div className="form-stack">
        <AppStepper
          steps={stepperSteps}
          currentStep={step}
          onStepChange={setStep}
          ariaLabel={t("initiate.progressLabel")}
          allowCompletedNavigation={screeningRunStatus !== "processing"}
        />

        <div className="app-wizard-layout">
          <div className="app-wizard-main">
            {renderStep()}

            {!stepValid && activeStepId !== "screeningRun" && (
              <p className="form-error" role="status">{t("initiate.validation.completeStep")}</p>
            )}
          </div>

          <aside className="app-wizard-aside" aria-label={t("initiate.impact.title")}>
            {selectionImpactPanel}
          </aside>
        </div>

        <AuditExplainerDrawer explanation={explanation} onClose={() => setExplanation(null)} />
      </div>
    </AppModal>
  );
}
