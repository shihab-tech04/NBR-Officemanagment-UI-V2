import { useEffect, useMemo, useState } from 'react';
import { Eye, Filter, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppSearchField } from '../../components/forms/AppSearchField';
import { MobileSearchFilter } from '../../components/shared/MobileSearchFilter';
import { FilterPanel } from '../../components/filters/FilterPanel';
import { MobileFilterOverlay } from '../../components/filters/MobileFilterOverlay';
import { AppliedFilterChips } from '../../components/filters/AppliedFilterChips';
import { Pagination } from '../../components/shared/Pagination';
import { ResponsiveTable } from '../../components/tables/ResponsiveTable';
import { useUIState } from '../../hooks/useUI';
import type { ColDef, FilterDef, MobileCardMapping, TableRow } from '../modulePageUtils';

/** Parse the controlled Payment snapshot's human-readable dates, never sort them lexicographically. */
export function paymentDateOrdinal(value:unknown):number|null {
  if(typeof value !== 'string')return null;
  const match=/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month=months.indexOf(match[2]);
  if(month<0)return null;
  const day=Number(match[1]); const year=Number(match[3]);
  const date=new Date(Date.UTC(year,month,day));
  if(date.getUTCMonth()!==month||date.getUTCDate()!==day)return null;
  return date.getTime();
}

type Props = {
  title: string; rows: TableRow[]; columns: ColDef[];
  filters?: FilterDef[]; mobileMapping?: MobileCardMapping;
  onOpen: (record: TableRow) => void;
};

/** Standard Office Management table + filter workflow, Payment-configured. */
export function PaymentRecordList({ title, rows, columns, filters = [], mobileMapping, onOpen }: Props) {
  const { t } = useTranslation('payment');
  const { isDesktop } = useUIState();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Record<string,string>>({});
  const [applied, setApplied] = useState<Record<string,string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState('');

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const filteredRows = rows.filter(row => {
      if (search && !Object.values(row).some(val => String(val ?? '').toLocaleLowerCase().includes(search))) return false;
      return Object.entries(applied).every(([key,value]) => !value || value === 'All' || String(row[key] ?? '') === value);
    });
    if (!sort) return filteredRows;
    const desc = sort.startsWith('-');
    const key = desc ? sort.slice(1) : sort;
    return [...filteredRows].sort((a,b) => {
      if(key==='date') {
        const left=paymentDateOrdinal(a.date), right=paymentDateOrdinal(b.date);
        if(left===null)return right===null?0:1;
        if(right===null)return -1;
        return (left-right)*(desc?-1:1);
      }
      return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric:true }) * (desc ? -1 : 1);
    });
  }, [rows, query, applied, sort]);
  const signature = JSON.stringify(applied);
  useEffect(() => { setPage(1); }, [query, signature, pageSize, sort]);
  const paged = filtered.slice((page-1)*pageSize,page*pageSize);
  const apply = () => { setApplied({...draftFilters});setShowFilters(false); };
  const reset = () => { setDraftFilters({});setApplied({});setShowFilters(false);setPage(1); };
  const change = (key:string,value:string) => setDraftFilters(s => ({...s,[key]:value}));
  const toggle = () => { setDraftFilters({...applied});setShowFilters(s=>!s); };
  const actions = [{id:'view',label:t('viewDetails'),icon:Eye}];

  return <>
    <MobileSearchFilter searchValue={query} onSearchChange={setQuery} onFilterClick={toggle} hasActiveFilters={Object.keys(applied).length > 0} placeholder={t('search')}/>
    <section className="table-card payment-module__table-card" aria-label={title}>
      <div className="table-card__toolbar">
        <div className="table-card__title-group"><h2 className="table-card__title">{title}</h2><span className="table-card__count" aria-live="polite">{filtered.length} {t('records')}</span></div>
        <div className="table-card__search-wrapper"><AppSearchField value={query} onChange={setQuery} label={t('search')} placeholder={t('search')} size="compact" clearable/></div>
        {filters.length > 0 && <button type="button" className={`table-card__toolbar-btn${showFilters?' table-card__toolbar-btn--active':''}`} onClick={toggle} aria-expanded={showFilters}>
          <Filter size={13} aria-hidden="true"/>{t('filters')}
        </button>}
        <label className="payment-module__sort">{t('sort')} <span className="sr-only">{title}</span><select aria-label={t('sort')} value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="">{t('defaultOrder')}</option><option value="-date">{t('newestFirst')}</option><option value="date">{t('oldestFirst')}</option>
          <option value="taxpayer_name">{t('taxpayer')}</option>
        </select><ChevronDown size={12} aria-hidden="true"/></label>
      </div>
      {isDesktop && showFilters && filters.length > 0 && <div className="table-card__filter-panel"><FilterPanel filters={filters} values={draftFilters} onChange={change} onApply={apply} onReset={reset}/></div>}
      <AppliedFilterChips inCard values={applied} filters={filters} onClear={reset}/>
      <ResponsiveTable cols={columns} rows={paged} actions={actions} onActionClick={(_,row)=>onOpen(row)} onRowClick={onOpen}
        mobileCardMapping={mobileMapping} noCard aria-label={title}/>
      <div className="table-card__pagination"><Pagination page={page} total={filtered.length} perPage={pageSize} onPage={setPage}
        perPageOptions={[5,10,20,50]} onPerPageChange={setPageSize}/></div>
    </section>
    {!isDesktop && filters.length > 0 && <MobileFilterOverlay isOpen={showFilters} filters={filters} values={draftFilters}
      onChange={change} onApply={apply} onReset={reset} onClose={()=>setShowFilters(false)}/>}
  </>;
}