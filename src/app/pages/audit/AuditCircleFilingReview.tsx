import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { Pagination } from "../../components/shared/Pagination";
import type { ColDef, TableRow } from "../modulePageUtils";
import { getCircleFilingRows, type CircleFilingRecord } from "./auditCircleFilingSource";
import "../../../styles/auditCircleReview.css";

interface AuditCircleFilingReviewProps {
  assessmentYear: string;
}

const pct = (returns: number, tins: number) =>
  tins > 0 ? ((returns / tins) * 100).toFixed(1) + "%" : "—";

export function AuditCircleFilingReview({ assessmentYear }: AuditCircleFilingReviewProps) {
  const { t, i18n } = useTranslation("audit");
  const localFmt = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage?.startsWith("bn") ? "bn-BD" : "en-US", { maximumFractionDigits: 2 }).format(value);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [sortKey, setSortKey] = useState("zone");
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");

  // Source Circle rows remain distinct from the Audit taxpayer population.
  // No Circle data is used to assign jurisdictions or modify selected returns.
  const yearRows = useMemo(() => getCircleFilingRows(assessmentYear), [assessmentYear]);
  const totals = useMemo(() => yearRows.reduce((result, row) => ({
    tins: result.tins + row.tinCount,
    returns: result.returns + row.reportedReturns,
    payment: result.payment + row.reportedPayment,
  }), { tins: 0, returns: 0, payment: 0 }), [yearRows]);

  const statusLabels: Record<string, string> = {
    "No relative flag": t("initiate.circleReview.status.none"),
    "Low filing coverage": t("initiate.circleReview.status.lowCoverage"),
    "High TIN base": t("initiate.circleReview.status.highBase"),
    "Priority review": t("initiate.circleReview.status.priority"),
  };
  const flagLabels: Record<string, string> = {
    "High paid outlier": t("initiate.circleReview.flags.highPaid"),
    "High return outlier": t("initiate.circleReview.flags.highReturns"),
    "High TIN count outlier": t("initiate.circleReview.flags.highTin"),
    "Extreme scale anomaly": t("initiate.circleReview.flags.extreme"),
    "Missing paid amount": t("initiate.circleReview.flags.missingPaid"),
    "Abnormal payment": t("initiate.circleReview.flags.abnormalPaid"),
  };
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const selected = yearRows.filter(row =>
      !needle || (row.zone + " " + row.circle).toLocaleLowerCase().includes(needle));
    const compare = (a: CircleFilingRecord, b: CircleFilingRecord) => {
      switch (sortKey) {
        case "tin_count": return a.tinCount - b.tinCount;
        case "returns": return a.reportedReturns - b.reportedReturns;
        case "filing_proxy": return (a.tinCount ? a.reportedReturns / a.tinCount : -1)
          - (b.tinCount ? b.reportedReturns / b.tinCount : -1);
        case "paid": return a.reportedPayment - b.reportedPayment;
        case "score": return (a.provisionalScore ?? -1) - (b.provisionalScore ?? -1);
        case "review": return a.review.localeCompare(b.review, "en");
        case "circle": return a.circle.localeCompare(b.circle, "en", { numeric: true });
        default: return a.zone.localeCompare(b.zone, "en", { numeric: true });
      }
    };
    const factor = sortDirection === "ascending" ? 1 : -1;
    return [...selected].sort((a, b) =>
      factor * compare(a, b) ||
      a.zone.localeCompare(b.zone, "en", { numeric: true }) ||
      a.circle.localeCompare(b.circle, "en", { numeric: true }));
  }, [yearRows, search, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visibleRows: TableRow[] = filteredRows
    .slice((currentPage - 1) * perPage, currentPage * perPage)
    .map(row => ({
      id: row.year + "|" + row.zone + "|" + row.circle,
      zone: row.zone,
      circle: row.circle,
      tin_count: localFmt(row.tinCount),
      returns: localFmt(row.reportedReturns),
      filing_proxy: (row.incompleteChannels ? t("initiate.circleReview.partial") + " · " : "")
        + pct(row.reportedReturns, row.tinCount),
      paid: "৳ " + localFmt(row.reportedPayment),
      review: (row.incompleteChannels ? t("initiate.circleReview.incomplete") + " · " : "")
        + (statusLabels[row.review] || row.review)
        + (row.sourceFlag ? " · " + row.sourceFlag.split(";").map(flag => flagLabels[flag.trim()] || flag.trim()).join(" · ") : ""),
      score: localFmt(row.provisionalScore) === null
        ? t("initiate.circleReview.unavailable")
        : t("initiate.circleReview.provisionalScore", { score: localFmt(row.provisionalScore) }),
    }));

  const col = (key: string, label: string, align?: "left" | "right"): ColDef => ({
    type: "col", col: { key, label, align, truncate: "normal" },
  });
  const cols: ColDef[] = [
    col("zone", t("initiate.circleReview.zone")),
    col("circle", t("initiate.circleReview.circle")),
    col("tin_count", t("initiate.circleReview.tinCount"), "right"),
    col("returns", t("initiate.circleReview.returns"), "right"),
    col("filing_proxy", t("initiate.circleReview.filingProxy"), "right"),
    col("paid", t("initiate.circleReview.paid"), "right"),
    col("review", t("initiate.circleReview.currentReview")),
    col("score", t("initiate.circleReview.score")),
  ];

  const changeSort = (nextKey: string) => {
    if (nextKey === sortKey) setSortDirection(value => value === "ascending" ? "descending" : "ascending");
    else {
      setSortKey(nextKey);
      setSortDirection("ascending");
    }
    setPage(1);
  };

  return (
    <section className="audit-circle-review" data-testid="audit-circle-review">
      {yearRows.length ? (
        <>
          <p className="audit-circle-review__source">
            {t("initiate.circleReview.source", { count: yearRows.length })}
          </p>
          <dl className="audit-circle-review__metrics" aria-label={t("initiate.circleReview.metricsLabel")}>
            {[
              [t("initiate.circleReview.circles"), localFmt(yearRows.length)],
              [t("initiate.circleReview.tinCount"), localFmt(totals.tins)],
              [t("initiate.circleReview.returns"), localFmt(totals.returns)],
              [t("initiate.circleReview.filingProxy"), pct(totals.returns, totals.tins)],
            ].map(([label, value]) => (
              <div className="audit-circle-review__metric" key={label}>
                <dt>{label}</dt><dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="audit-circle-review__payment">
            {t("initiate.circleReview.totalPaid")}: <strong>৳ {localFmt(totals.payment)}</strong>
          </p>
          <div className="audit-circle-review__toolbar">
            <AppSearchField
              value={search}
              onChange={value => { setSearch(value); setPage(1); }}
              label={t("initiate.circleReview.search")}
              placeholder={t("initiate.circleReview.search")}
              size="compact"
            />
            <span className="audit-circle-review__count">
              {t("initiate.circleReview.matching", { filtered: localFmt(filteredRows.length), total: localFmt(yearRows.length) })}
            </span>
          </div>
          <div className="audit-circle-review__table">
            <ResponsiveTable
              cols={cols}
              rows={visibleRows}
              aria-label={t("initiate.circleReview.tableLabel")}
              noCard
              emptyMessage={t("initiate.circleReview.empty")}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSortColumn={changeSort}
              mobileCardMapping={{
                primary: "circle", identifier: "zone",
                meta: ["tin_count", "returns", "filing_proxy"],
                status: "review", amount: "paid",
              }}
            />
          </div>
          <Pagination
            total={filteredRows.length}
            page={currentPage}
            perPage={perPage}
            onPage={setPage}
            perPageOptions={[5, 10, 25]}
            onPerPageChange={value => { setPerPage(value); setPage(1); }}
            perPageLabel={t("initiate.previewSummary.rowsPerPage")}
          />
          <p className="audit-circle-review__note">{t("initiate.circleReview.note")}</p>
        </>
      ) : (
        <p className="form-helper" role="status">
          {t("initiate.circleReview.noYear", { year: assessmentYear })}
        </p>
      )}
    </section>
  );
}
