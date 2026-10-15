import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppModal } from "../../components/modals/AppModal";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { EntryForm, type EntryFormValue } from "../../components/forms/EntryForm";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { useSettings } from "../../hooks/useSettings";
import { REGISTER4_ASSESSMENT_ROWS, buildRegister4EntryFields } from "./register4AssessmentTable";
import { getRegister4DemoShortcutSection, reviewRegister4History } from "./register4SectionCodes";
import "../../../styles/register4-entry.css";

type Taxpayer = { taxpayer_name: string; tin: string; circle: string; assessment_year: string };

/** Current controlled prototype: TIN lookup is local and exact-match only.
 * This must not be connected to an unverified identity or production NBR endpoint. */
export function findRegister4Taxpayer(tin: string): Taxpayer | null {
  const query = tin.trim().toLocaleUpperCase("en");
  if (!query) return null;
  const found = REGISTER4_ASSESSMENT_ROWS.find(row =>
    typeof row.tin === "string" && row.tin.toLocaleUpperCase("en") === query
  );
  if (!found || typeof found.taxpayer_name !== "string" ||
    typeof found.tin !== "string" || typeof found.circle !== "string" ||
    typeof found.assessment_year !== "string") return null;
  return { taxpayer_name: found.taxpayer_name, tin: found.tin,
    circle: found.circle, assessment_year: found.assessment_year };
}

/** Deterministic, deduplicated TIN suggestions from the existing demo fixture.
 * Prefix/substring matching is display-only, never an authenticated identity lookup.
 */
export function getRegister4TinSuggestions(query: string, limit = 4): string[] {
  const normalized = query.trim().toLocaleUpperCase("en");
  const unique = [...new Set(REGISTER4_ASSESSMENT_ROWS
    .map(row => typeof row.tin === "string" ? row.tin : "")
    .filter(Boolean))];
  return unique
    .filter(tin => tin.toLocaleUpperCase("en").includes(normalized))
    .slice(0, Math.max(0, limit));
}

interface Register4EntryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, EntryFormValue>) => void;
}

export function Register4EntryModal({ open, onClose, onSubmit }: Register4EntryModalProps) {
  const { assessmentYear } = useSettings();
  const { t: tp } = useTranslation("pages");
  const { t: th } = useTranslation("tables");
  const { t: actions } = useTranslation("actions");
  const { t: common } = useTranslation("common");
  const [tinQuery, setTinQuery] = useState("");
  const [selected, setSelected] = useState<Taxpayer | null>(null);
  const [searched, setSearched] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the lookup and draft inputs every time the modal closes.
  useEffect(() => {
    if (!open) { setTinQuery(""); setSelected(null); setSearched(false); }
  }, [open]);

  const suggestions = useMemo(
    () => selected ? [] : getRegister4TinSuggestions(tinQuery),
    [tinQuery, selected]
  );

  const chooseSuggestion = (tin: string) => {
    setTinQuery(tin);
    setSelected(findRegister4Taxpayer(tin));
    setSearched(true);
  };

  const formFields = useMemo(() => selected
    ? buildRegister4EntryFields(assessmentYear, th, tp)
        .filter(field => field.key !== "taxpayer_name" && field.key !== "tin")
        .map(field => field.key === "circle" ? { ...field, defaultValue: selected.circle }
          : field.key === "disposal_code" ? { ...field, defaultValue: getRegister4DemoShortcutSection(selected.tin) }
          : field)
    : [], [selected, assessmentYear, th, tp]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelected(findRegister4Taxpayer(tinQuery));
    setSearched(true);
  };
  const updateQuery = (value: string) => {
    setTinQuery(value);
    setSelected(null);
    setSearched(false);
  };
  const submit = (values: Record<string, EntryFormValue>) => {
    if (!selected) return; // No draft without a resolved TIN.
    const trail=typeof values.disposal_code==="string"?values.disposal_code:"";
    const decision=reviewRegister4History(trail);
    // The selected sections create review-only session drafts. The UI must
    // never mark a case verified or execute a tax/ledger action.
    if(decision.status==="BLOCKED") return;
    onSubmit({...values,taxpayer_name:selected.taxpayer_name,tin:selected.tin,
      section_review_status:"REVIEW_REQUIRED — not certified"});
  };

  return (
    <AppModal
      open={open}
      title={actions("newEntry")}
      size="lg"
      onClose={onClose}
      footer={<>
        <SecondaryButton type="button" onClick={onClose}>{common("actions.cancel")}</SecondaryButton>
        <PrimaryButton type="button" disabled={!selected} onClick={() => formRef.current?.requestSubmit()}>
          {tp("register4.createNewEntry")}
        </PrimaryButton>
      </>}
    >
      <div className="register4-entry">
        <div className="register4-entry__lookup-group">
          <form className="register4-entry__lookup" onSubmit={search} role="search">
            <div className="register4-entry__search">
              <AppSearchField
                value={tinQuery}
                onChange={updateQuery}
                label={tp("register4.searchTin")}
                placeholder={tp("register4.searchTin")}
                size="compact"
              />
            </div>
            <SecondaryButton type="submit">{tp("register4.searchAction")}</SecondaryButton>
          </form>
          {suggestions.length > 0 && (
            <div className="register4-entry__suggestions" role="group" aria-label={tp("register4.tinSuggestions")}>
              {suggestions.map(tin => (
                <button
                  key={tin}
                  type="button"
                  className="register4-entry__suggestion"
                  onClick={() => chooseSuggestion(tin)}
                  aria-label={tin}
                  title={getRegister4DemoShortcutSection(tin)
                    ? tp("register4.shortcutExample", { sections: getRegister4DemoShortcutSection(tin) })
                    : tp("register4.shortcutFresh")}
                >
                  <span className="register4-entry__suggestion-main">{tin}</span>
                  <span className="register4-entry__suggestion-secondary">
                    {getRegister4DemoShortcutSection(tin) || tp("register4.shortcutFresh")}
                    <Info size={12} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {searched && !selected && (
          <p role="status" className="register4-entry__feedback">{tp("register4.tinNotFound")}</p>
        )}

        {selected && (
          <>
            <section className="register4-entry__identity" aria-label={tp("register4.taxpayerDetails")}>
              <h3 className="register4-entry__name">{selected.taxpayer_name}</h3>
              <div className="register4-entry__identity-facts">
                <p>{th("headers.tin")}: {selected.tin}</p>
                <p>{th("headers.circle")}: {selected.circle}</p>
                <p>{th("headers.register4AssessmentYear")}: {selected.assessment_year}</p>
                <p>{tp("register4.serialAutomatic")}</p>
              </div>
            </section>
            <div className="register4-entry__fields">
              <EntryForm
                key={selected.tin + ":" + assessmentYear}
                fields={formFields}
                onClose={onClose}
                onSubmit={submit}
                formRef={formRef}
                compactFields
                sectionEditor="inline"
                hideFooter
              />
            </div>
          </>
        )}
      </div>
    </AppModal>
  );
}
