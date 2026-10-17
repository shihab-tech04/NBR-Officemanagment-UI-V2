import { useState } from "react";
import {
  Users, Receipt, FileText, BarChart2,
  Globe, TrendingUp, FilePlus, CreditCard,
  PiggyBank, Car, Landmark, Banknote, MoreHorizontal,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatCard } from "../../components/cards/StatCard";
import { DashSection } from "../../components/dashboard/DashSection";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { useSettings } from "../../hooks/useSettings";
import type { ColDef } from "../modulePageUtils";
import { gen, CIRCLES_DATA, NAMES, AY_OPTS } from "../modulePageUtils";
import { formatLocalizedDate, formatLocalizedNumber } from "../../utils/localeFormatting";

const INITIAL_VISIBLE = 6;

const RECENT_COLS: ColDef[] = [
  { type: "col", col: { key: "tin", label: "TIN", headerKey: "headers.tin", mono: true } },
  { type: "col", col: { key: "taxpayer_name", label: "Taxpayer Name", headerKey: "headers.taxpayerName" } },
  { type: "col", col: { key: "return_type", label: "Type", headerKey: "headers.type" } },
  { type: "col", col: { key: "submission_status", label: "Status", headerKey: "headers.status", badge: true } },
];

const CIRCLE_COLS: ColDef[] = [
  { type: "col", col: { key: "circle", label: "Circle", headerKey: "headers.circle" } },
  { type: "col", col: { key: "total", label: "Total", headerKey: "headers.total", mono: true } },
  { type: "col", col: { key: "pending", label: "Pending", headerKey: "headers.pending", mono: true } },
  { type: "col", col: { key: "approved", label: "Approved", headerKey: "headers.approved", mono: true } },
  { type: "col", col: { key: "tax", label: "Tax Collected", headerKey: "headers.taxCollected", mono: true } },
];

export function DashboardPage() {
  const { assessmentYear: ay } = useSettings();
  const { t: translate, i18n } = useTranslation("dashboard");
  const { t: translateCommon } = useTranslation("common");
  const { t: translateKpi } = useTranslation("kpi");

  const [kpiExpanded, setKpiExpanded] = useState(false);
  const displayNumber = (value: number) => formatLocalizedNumber(value, i18n.resolvedLanguage);
  const displayDate = (value: string) => formatLocalizedDate(value, i18n.resolvedLanguage);

  const circleData = CIRCLES_DATA.map((c, i) => ({
    circle: c, total: 200 + i * 80, pending: 20 + i * 5, approved: 170 + i * 70, tax: `৳${30 + i * 15}L`,
  }));
  const recentRows = gen(6, i => ({
    return_type: ["Normal", "82BB", "82C(2)"][i % 3],
    submitted_at: `2026-05-${String(28 - i).padStart(2, "0")}`,
    submission_status: ["Approved", "Pending", "Verified"][i % 3],
  }));

  const allKpis = [
    // Group 1 — Registration & Submission (first 6, visible by default)
    { label: translateKpi("totalOnlineRegistration"),   value: displayNumber(107), icon: Globe,         tone: "primary" as const, subInfo: `${translate("labels.asOf")} ${displayDate("2026-06-08")}` },
    { label: translateKpi("currentOnlineRegistration"), value: displayNumber(0),   icon: TrendingUp,    tone: "primary" as const, subInfo: `${displayDate("2025-07-01")} – ${displayDate("2026-06-08")}` },
    { label: translateKpi("totalOnlineSubmission"),     value: displayNumber(0),   icon: FileText,      tone: "primary" as const },
    { label: translateKpi("taxPaidEReturn"),            value: displayNumber(0),   icon: CreditCard,    tone: "success" as const, subInfo: translate("labels.paidByZero") },
    { label: translateKpi("totalTdsAdvanceTax"),        value: displayNumber(0),   icon: PiggyBank,     tone: "success" as const },
    { label: translateKpi("totalAmendmentReturn"),      value: displayNumber(0),   icon: FilePlus,      tone: "neutral" as const },
    // Group 2 — Tax Payments & Claims (visible after See More)
    { label: translateKpi("taxPaidWithReturn"),         value: displayNumber(0), icon: Receipt,       tone: "success" as const, subInfo: translate("labels.claimedByZero") },
    { label: translateKpi("totalClaimedIbasChallan"),   value: displayNumber(0), icon: Landmark,      tone: "primary" as const, subInfo: translate("labels.claimedByZero") },
    { label: translateKpi("advanceTaxCarChallan"),      value: displayNumber(0), icon: Car,           tone: "neutral" as const, subInfo: translate("labels.claimedByZero") },
    { label: translateKpi("tdsSavingCertificate"),      value: displayNumber(0), icon: Banknote,      tone: "primary" as const },
    { label: translateKpi("tdsBankInterest"),           value: displayNumber(0), icon: Banknote,      tone: "primary" as const },
    { label: translateKpi("otherTdsAitClaims"),         value: displayNumber(0), icon: MoreHorizontal,tone: "neutral" as const },
  ];

  const visibleKpis = kpiExpanded ? allKpis : allKpis.slice(0, INITIAL_VISIBLE);
  const hasMore = allKpis.length > INITIAL_VISIBLE;

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__title">{translate("main.title")}</h1>
        <p className="dashboard-page__subtitle">{translate("main.subtitle")}</p>
      </div>

      {/* KPI Cards — collapsible */}
      <div className="dashboard-kpi-section">
        <div className="dashboard-kpi-grid">
          {visibleKpis.map((card, i) => (
            <StatCard
              key={i}
              icon={card.icon}
              value={card.value}
              label={card.label}
              subInfo={card.subInfo}
              trend={card.change}
              trendUp={card.up}
              tone={card.tone}
            />
          ))}
        </div>

        {hasMore && (
          <div className="dashboard-kpi-toggle">
            <button
              className="dashboard-kpi-toggle__btn"
              onClick={() => setKpiExpanded(prev => !prev)}
              aria-expanded={kpiExpanded}
              aria-controls="kpi-cards-overflow"
            >
              {kpiExpanded ? (
                <>{translate("actions.seeLess")} <ChevronUp size={15} strokeWidth={2} /></>
              ) : (
                <>{translate("actions.seeMore")} <ChevronDown size={15} strokeWidth={2} /></>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="dashboard-section-grid" style={{ gridTemplateColumns: "1fr" }}>
        <DashSection title={translate("sections.recentSubmissions")} icon={FileText} badge={`${translateCommon("common.ayAbbrev")} ${ay}`}>
          <ResponsiveTable cols={RECENT_COLS} rows={recentRows} noCard />
        </DashSection>

        {/* Circle-wise Summary hidden from UI — data preserved */}
        {false && <DashSection title={translate("sections.circlewiseSummary")} icon={BarChart2} badge={`${translateCommon("common.ayAbbrev")} ${ay}`}>
          <ResponsiveTable cols={CIRCLE_COLS} rows={circleData} noCard />
        </DashSection>}
      </div>
    </div>
  );
}
