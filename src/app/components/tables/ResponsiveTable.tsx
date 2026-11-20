import { memo, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CardTable } from "./CardTable";
import { UnifiedMobileCard } from "./UnifiedMobileCard";
import type { ColDef, RowAction, TableRow, MobileCardMapping } from "../../pages/modulePageUtils";

/** Keep mobile card identity anchored to the record, not its current filtered
 * position. Prefer an immutable source ID; for old registers without one use
 * stable field content. The suffix disambiguates truly duplicated records.
 * This changes only React reconciliation, never the approved table layout.
 */
function recordKeys(rows: readonly TableRow[]): string[] {
  const occurrences = new Map<string,number>();
  return rows.map(row=>{
    const recordId = row.id ?? row.uuid ?? row.transaction_id ?? row.transactionId;
    const knownId = (typeof recordId === 'string' && recordId.trim()) ||
      (typeof recordId === 'number' && Number.isFinite(recordId));
    const identity = knownId
      ? 'record:' + String(recordId)
      : 'fields:' + Object.keys(row).sort().map(key=>
          key + ':' + JSON.stringify(row[key] ?? null)).join('|');
    const repeat = occurrences.get(identity) ?? 0;
    occurrences.set(identity,repeat+1);
    return identity + '#' + repeat;
  });
}

interface ResponsiveTableProps {
  cols: ColDef[];
  rows: TableRow[];
  actions?: RowAction[];
  onRowClick?: (row: TableRow) => void;
  onActionClick?: (actionId: string, row: TableRow) => void;
  noCard?: boolean;
  mobileCardMapping?: MobileCardMapping;
  clickableKeys?: string[];
  onCellClick?: (key: string, value: string, row: TableRow) => void;
  "aria-label"?: string;
  inlineRow?: ReactNode;
  inlineMobileRow?: ReactNode;
  emptyMessage?: string;
  sortKey?: string;
  sortDirection?: "ascending" | "descending";
  onSortColumn?: (key: string) => void;
}

export const ResponsiveTable = memo(function ResponsiveTable({
  cols,
  rows,
  actions,
  onRowClick,
  onActionClick,
  noCard,
  mobileCardMapping,
  clickableKeys,
  onCellClick,
  "aria-label": ariaLabel,
  inlineRow,
  inlineMobileRow,
  emptyMessage,
  sortKey,
  sortDirection,
  onSortColumn,
}: ResponsiveTableProps) {
  const { t: translateCommon } = useTranslation("common");
  const mobileKeys = useMemo(()=>recordKeys(rows),[rows]);

  const makeCardClick = useCallback(
    (row: TableRow) => onRowClick ? () => onRowClick(row) : undefined,
    [onRowClick]
  );

  // Effective action handler: prefer onActionClick, fall back to onRowClick
  const handleActionClick = useCallback(
    (actionId: string, row: TableRow) => {
      if (onActionClick) {
        onActionClick(actionId, row);
      } else {
        onRowClick?.(row);
      }
    },
    [onActionClick, onRowClick]
  );

  return (
    <>
      {/* Desktop table view */}
      <CardTable
        cols={cols}
        rows={rows}
        actions={actions}
        onRowClick={onRowClick}
        onActionClick={handleActionClick}
        noCard={noCard}
        clickableKeys={clickableKeys}
        onCellClick={onCellClick}
        aria-label={ariaLabel}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortColumn={onSortColumn}
        inlineRow={inlineRow}
        emptyMessage={emptyMessage}
      />

      {/* Mobile card view */}
      <div
        className="mobile-table-card-list"
        role="list"
        aria-label={ariaLabel}
      >
        {inlineMobileRow}
        {rows.length === 0 && !inlineMobileRow ? (
          <p className="mobile-table-card-list__empty" role="status">
            {emptyMessage ?? translateCommon("common.noRecordsFound")}
          </p>
        ) : (
          rows.map((row, index) => (
            <UnifiedMobileCard
              key={mobileKeys[index]}
              row={row}
              cols={cols}
              onCardClick={makeCardClick(row)}
              actions={actions}
              onActionClick={actionId => handleActionClick(actionId,row)}
              mobileCardMapping={mobileCardMapping}
              clickableKeys={clickableKeys}
              onCellClick={onCellClick}
            />
          ))
        )}
      </div>
    </>
  );
});