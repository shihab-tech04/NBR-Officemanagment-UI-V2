import { Autocomplete, TextField, MenuItem } from "@mui/material";
import { muiFieldSx, muiFilterSx } from "./muiFieldSx";

interface SelectOption {
  value: string;
  label: string;
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
  /** Switch to a searchable autocomplete when non-empty options exceed this count. */
  searchableAfter?: number;
}

export function AppSelectField({
  id, label, value, onChange, options, helper, error,
  required, disabled, compact, ariaLabel, sortOptions = false, searchableAfter,
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
  const isSearchable = searchableAfter !== undefined && nonEmptyOptions.length > searchableAfter;

  if (isSearchable) {
    const selectedOption = nonEmptyOptions.find(option => option.value === value) ?? null;

    return (
      <Autocomplete
        id={id}
        options={nonEmptyOptions}
        value={selectedOption}
        onChange={(_, option) => onChange(option?.value ?? "")}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, selected) => option.value === selected.value}
        disabled={disabled}
        fullWidth
        autoHighlight
        renderInput={(params) => (
          <TextField
            {...params}
            label={label || undefined}
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
    >
      {normalized.map(o => (
        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
      ))}
    </TextField>
  );
}
