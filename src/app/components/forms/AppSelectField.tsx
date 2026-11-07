import { Autocomplete, TextField, MenuItem } from "@mui/material";
import { muiFieldSx, muiFilterSx } from "./muiFieldSx";

interface SelectOption {
  value: string;
  label: string;
  /** Per-option availability; optional so existing shared consumers are unchanged. */
  disabled?: boolean;
  title?: string;
  /** Optional group label and secondary line for long searchable catalogues. */
  group?: string;
  secondary?: string;
  /** Optional menu-row class for a context-specific action. */
  className?: string;
}

interface AppSelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[] | string[];
  helper?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** compact=true → size="small" (filters, topbar). Default → MUI normal size (forms). */
  compact?: boolean;
  ariaLabel?: string;
  /** Sort non-empty options alphabetically by their visible label. */
  sortOptions?: boolean;
  /** Searchable for more than four choices by default; Infinity retains the native menu. */
  searchableAfter?: number;
  /** Optional controlled menu state for a separate, accessible add action. */
  selectOpen?: boolean;
  onSelectOpenChange?: (open: boolean) => void;
}

export function AppSelectField({
  id, label, value, onChange, options, helper, error,
  required, disabled, compact, ariaLabel, sortOptions = false, searchableAfter,
  selectOpen, onSelectOpenChange,
}: AppSelectFieldProps) {
  const normalizedRaw: SelectOption[] = options.map(o =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  const normalized = sortOptions
    ? [
        ...normalizedRaw.filter(option => option.value === ""),
        ...normalizedRaw
          .filter(option => option.value !== "")
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })),
      ]
    : normalizedRaw;

  const nonEmptyOptions = normalized.filter(option => option.value !== "");
  const isSearchable = !onSelectOpenChange && selectOpen === undefined &&
    nonEmptyOptions.length > (searchableAfter ?? 4);
  const grouped = nonEmptyOptions.some(option=>Boolean(option.group));
  const autocompleteOptions = grouped
    ? [...nonEmptyOptions].sort((a,b)=>(a.group??'').localeCompare(b.group??''))
    : nonEmptyOptions;

  if (isSearchable) {
    const selectedOption = nonEmptyOptions.find(option => option.value === value) ?? null;

    return (
      <Autocomplete
        id={id}
        options={autocompleteOptions}
        groupBy={grouped ? option => option.group ?? "" : undefined}
        value={selectedOption}
        onChange={(_, option) => onChange(option?.value ?? "")}
        getOptionLabel={(option) => option.label}
        renderOption={(props, option) => (
          <li {...props} key={option.value} title={option.title} className={[props.className,option.className].filter(Boolean).join(' ')}>
            <span className="block min-w-0">
              <span className="block">{option.label}</span>
              {option.secondary && <span className="block text-xs text-[var(--color-text-secondary)]">{option.secondary}</span>}
            </span>
          </li>
        )}
        getOptionDisabled={(option) => !!option.disabled}
        isOptionEqualToValue={(option, selected) => option.value === selected.value}
        disabled={disabled}
        fullWidth
        autoHighlight
        ListboxProps={{style:{maxHeight:240,overscrollBehavior:"contain"}}}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label || undefined}
            placeholder={normalizedRaw.find((option) => option.value === "")?.label}
            helperText={error || helper}
            error={!!error}
            required={required}
            variant="outlined"
            size={compact ? "small" : undefined}
            fullWidth
            inputProps={{
              ...params.inputProps,
              "aria-required": required ? "true" : undefined,
              "aria-describedby": (error || helper) ? `${id}-helper` : undefined,
              "aria-invalid": !!error || undefined,
              "aria-label": ariaLabel || (!label ? id : undefined),
            }}
            FormHelperTextProps={{ id: `${id}-helper` }}
            sx={compact ? muiFilterSx : muiFieldSx}
          />
        )}
      />
    );
  }

  return (
    <TextField
      id={id}
      select
      label={label || undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={error || helper}
      error={!!error}
      required={required}
      disabled={disabled}
      variant="outlined"
      size={compact ? "small" : undefined}
      fullWidth
      inputProps={{
        "aria-required": required ? "true" : undefined,
        "aria-describedby": (error || helper) ? `${id}-helper` : undefined,
        "aria-invalid": !!error || undefined,
        "aria-label": ariaLabel || (!label ? id : undefined),
      }}
      FormHelperTextProps={{ id: `${id}-helper` }}
      sx={compact ? muiFilterSx : muiFieldSx}
      SelectProps={onSelectOpenChange ? {
        open: selectOpen,
        onOpen: () => onSelectOpenChange(true),
        onClose: () => onSelectOpenChange(false),
      } : undefined}
    >
      {normalized.map(o => (
        <MenuItem key={o.value} value={o.value} disabled={o.disabled} title={o.title} className={o.className}>{o.label}</MenuItem>
      ))}
    </TextField>
  );
}
