import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextField } from "../../components/forms/AppTextField";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { REGISTER4_SECTIONS, appendRegister4Section, register4SectionTrail, undoRegister4Section } from "./register4SectionCodes";

type Props = {
  id: string; label: string; value: string;
  onChange: (next: string) => void;
  helper?: string; error?: string; required?: boolean;
};

/** Only changes the local draft form's Under Section field; no shared table mutation. */
export function Register4SectionField({ id, label, value, onChange, helper, error, required }: Props) {
  const { t, i18n } = useTranslation("pages");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState("");
  const codes = register4SectionTrail(value);
  const isBangla = i18n.language?.startsWith("bn");
  const options = [
    { value: "", label: t("register4.sectionChoose") },
    ...REGISTER4_SECTIONS.map(item => ({
      value: item.code,
      label: item.code + " — " + (isBangla ? item.bn : item.en),
    })),
    { value: "__custom__", label: t("register4.sectionAddNew") },
  ];
  const choose = (picked: string) => {
    if (picked === "__custom__") {
      setCustomOpen(true);
      setCustomError("");
      return;
    }
    if (!picked) return;
    const next = appendRegister4Section(value, picked);
    if (next !== null) onChange(next);
  };
  const addCustom = () => {
    const next = appendRegister4Section(value, custom);
    if (next === null) {
      setCustomError(t("register4.sectionInvalid"));
      return;
    }
    onChange(next);
    setCustom("");
    setCustomError("");
    setCustomOpen(false);
  };
  return (
    <div className="register4-section-field">
      <AppSelectField
        id={id}
        label={label}
        value=""
        onChange={choose}
        options={options}
        helper={error || helper}
        error={error}
        required={required}
      />
      {codes.length > 0 && (
        <div className="register4-section-field__selection">
          <div>
            <p className="register4-section-field__caption">{t("register4.sectionSelected")}</p>
            <output className="register4-section-field__trail" aria-live="polite">{value}</output>
          </div>
          <button type="button" className="register4-section-field__undo"
            onClick={() => onChange(undoRegister4Section(value))}>
            {t("register4.sectionUndo")}
          </button>
        </div>
      )}
      {customOpen && (
        <div className="register4-section-field__custom">
          <AppTextField
            id={id + "-custom"}
            label={t("register4.sectionCustomLabel")}
            value={custom}
            onChange={next => { setCustom(next); setCustomError(""); }}
            error={customError || undefined}
            placeholder="182(4)"
            maxLength={24}
          />
          <div className="register4-section-field__actions">
            <SecondaryButton type="button" onClick={() => {
              setCustomOpen(false); setCustom(""); setCustomError("");
            }}>{t("register4.sectionCancel")}</SecondaryButton>
            <PrimaryButton type="button" onClick={addCustom}>{t("register4.sectionAdd")}</PrimaryButton>
          </div>
          <p className="register4-section-field__note">{t("register4.sectionUnverified")}</p>
        </div>
      )}
    </div>
  );
}
