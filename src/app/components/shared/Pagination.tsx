import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatLocalizedNumber } from "../../utils/localeFormatting";

interface PaginationProps {
  total: number;
  page: number;
  perPage: number;
  onPage: (p: number) => void;
  perPageOptions?: number[];
  onPerPageChange?: (perPage: number) => void;
  perPageLabel?: string;
}

export function Pagination({
  total,
  page,
  perPage,
  onPage,
  perPageOptions,
  onPerPageChange,
  perPageLabel,
}: PaginationProps) {
  const { t: translate, i18n } = useTranslation("common");
  const number = (value: number) => formatLocalizedNumber(value, i18n.resolvedLanguage);
  const totalPages = Math.ceil(total / perPage);
  const showPageSize = !!onPerPageChange && !!perPageOptions?.length;
  if (totalPages <= 1 && !showPageSize) return null;

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <nav
      aria-label={translate("accessibility.pagination")}
      className="pagination"
    >
      <div className="pagination__meta">
        <span className="pagination__info" aria-live="polite" aria-atomic="true">
          {translate("common.showing")} {number(from)}–{number(to)} {translate("common.of")} {number(total)} {translate("common.records")}
        </span>

        {showPageSize && (
          <label className="pagination__size">
            <span>{perPageLabel ?? translate("common.perPage")}</span>
            <select
              className="pagination__size-select"
              value={perPage}
              onChange={(event) => onPerPageChange?.(Number(event.target.value))}
            >
              {perPageOptions?.map((option) => (
                <option key={option} value={option}>{number(option)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination__controls" role="group" aria-label={translate("accessibility.pageNavigation")}>
          <button
            disabled={page === 1}
            onClick={() => onPage(page - 1)}
            aria-label={translate("accessibility.goToPreviousPage")}
            className="pagination__btn"
          >
            <ChevronLeft size={12} aria-hidden="true" />
            {translate("actions.previous")}
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-label={translate("accessibility.page", { number: number(p) })}
              aria-current={p === page ? "page" : undefined}
              className={`pagination__page${p === page ? " pagination__page--active" : ""}`}
            >
              {number(p)}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => onPage(page + 1)}
            aria-label={translate("accessibility.goToNextPage")}
            className="pagination__btn"
          >
            {translate("actions.next")}
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
