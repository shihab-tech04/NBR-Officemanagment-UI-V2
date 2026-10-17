import { useTranslation } from "react-i18next";
import { BarChart2, CheckCircle, AlertCircle, XCircle, Info } from "lucide-react";
import { StatCard } from "./StatCard";
import type { KpiDef, IconComponent } from "../../pages/modulePageUtils";

interface KpiRowProps {
  kpis: KpiDef[];
}

const TONE_MAP: Record<string, "primary" | "success" | "warning" | "error" | "neutral"> = {
  success: "success", warning: "warning", error: "error", primary: "primary",
};

const TONE_ICON: Record<string, IconComponent> = {
  primary: BarChart2,
  success: CheckCircle,
  warning: AlertCircle,
  error: XCircle,
  neutral: Info,
};

function chunkKpis(kpis: KpiDef[]): KpiDef[][] {
  const n = kpis.length;
  if (n <= 4) return [kpis];
  if (n === 5) return [kpis.slice(0, 3), kpis.slice(3)];
  if (n === 6) return [kpis.slice(0, 3), kpis.slice(3)];
  if (n === 7) return [kpis.slice(0, 4), kpis.slice(4)];
  if (n === 8) return [kpis.slice(0, 4), kpis.slice(4)];
  const half = Math.ceil(n / 2);
  return [kpis.slice(0, half), kpis.slice(half)];
}

export function formatKpiDisplayValue(value: string, language?: string): string {
  if (!language?.startsWith("bn")) return value;
  const shorthand = value.match(/^৳([\d.]+)(Cr|L|K)$/);
  if (shorthand) {
    const unit = { Cr: "কোটি", L: "লাখ", K: "হাজার" }[shorthand[2] as "Cr" | "L" | "K"];
    const number = new Intl.NumberFormat("bn-BD", {
      minimumFractionDigits: shorthand[1].includes(".") ? 1 : 0,
      maximumFractionDigits: 1,
    }).format(Number(shorthand[1]));
    return `৳${number} ${unit}`;
  }
  if (/^৳\d+(?:\.\d+)?$/.test(value))
    return `৳${new Intl.NumberFormat("bn-BD").format(Number(value.slice(1)))}`;
  if (/^\d+(?:\.\d+)?$/.test(value))
    return new Intl.NumberFormat("bn-BD").format(Number(value));
  return value;
}

export function KpiRow({ kpis }: KpiRowProps) {
  const { t: translate, i18n } = useTranslation("kpi");
  const rows = chunkKpis(kpis);

  const renderCard = (k: KpiDef, i: number) => {
    const tone = k.tone ?? (k.color ? (TONE_MAP[k.color] ?? "primary") : "primary");
    const icon = k.icon ?? TONE_ICON[tone] ?? BarChart2;
    return (
      <StatCard
        key={i}
        icon={icon}
        value={formatKpiDisplayValue(k.value, i18n?.resolvedLanguage)}
        label={k.labelKey ? (translate(k.labelKey) || k.label) : k.label}
        tone={tone}
      />
    );
  };

  if (rows.length === 1) {
    return (
      <div className="dashboard-kpi-grid dashboard-kpi-grid--1row">
        {kpis.map(renderCard)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "20px" }}>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="dashboard-kpi-grid dashboard-kpi-grid--1row"
          style={{ marginBottom: 0 }}
        >
          {row.map(renderCard)}
        </div>
      ))}
    </div>
  );
}
