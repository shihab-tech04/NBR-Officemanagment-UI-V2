import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatLocalizedNumber } from "../../utils/localeFormatting";

/** Office-wide compact page navigation. Never render hundreds of page buttons. */
export function getPaginationItems(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const start = Math.max(2, Math.min(safePage - 2, totalPages - 5));
  const end = Math.min(totalPages - 1, start + 4);
  const items: Array<number | "ellipsis"> = [1];
  if (start > 2) items.push("ellipsis");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

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
  const safePage = Math.max(1, Math.min(page, Math.max(totalPages, 1)));
  const pageItems = getPaginationItems(totalPages, safePage);
  const showPageSize = !!onPerPageChange && !!perPageOptions?.length;
  if (totalPages <= 1 && !showPageSize) return null;

  const from = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const to = Math.min(safePage * perPage, total);

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
            disabled={safePage === 1}
            onClick={() => onPage(safePage - 1)}
            aria-label={translate("accessibility.goToPreviousPage")}
            className="pagination__btn"
          >
            <ChevronLeft size={12} aria-hidden="true" />
            {translate("actions.previous")}
          </button>
          {pageItems.map((p, index) => p === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="pagination__ellipsis" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-label={translate("accessibility.page", { number: number(p) })}
              aria-current={p === safePage ? "page" : undefined}
              className={`pagination__page${p === safePage ? " pagination__page--active" : ""}`}
            >
              {number(p)}
            </button>
          ))}
          <button
            disabled={safePage === totalPages}
            onClick={() => onPage(safePage + 1)}
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
