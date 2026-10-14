import { useRef, useState } from "react";
import { Popover } from "@mui/material";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextField } from "../../components/forms/AppTextField";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import {
  REGISTER4_SECTIONS,
  appendRegister4Section,
  normalizeRegister4SectionCode,
  register4SectionTrail,
  undoRegister4Section,
} from "./register4SectionCodes";

type Props = {
  id: string; label: string; value: string;
  onChange: (next: string) => void;
  helper?: string; error?: string; required?: boolean;
};

/** Local Register-4 draft control. No legal approval or government write occurs here. */
export function Register4SectionField({ id, label, value, onChange, helper, error, required }: Props) {
  const { t, i18n } = useTranslation("pages");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState("");
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const codes = register4SectionTrail(value);
  const bn = i18n.language?.startsWith("bn");
  const options = [
    { value: "__current__", label: value || t("register4.sectionChoose") },
    ...REGISTER4_SECTIONS.map(item => ({
      value: "__pick__:" + item.code,
      label: item.code + " — " + (bn ? item.bn : item.en),
    })),
    ...draftCodes.filter(code => !REGISTER4_SECTIONS.some(x => x.code === code))
      .map(code => ({ value: "__pick__:" + code, label: code })),
    ...(codes.length ? [{ value: "__undo__", label: t("register4.sectionUndo") }] : []),
  ];

  const choose = (option: string) => {
    if (option === "__undo__") { onChange(undoRegister4Section(value)); return; }
    if (option.startsWith("__pick__:")) {
      const next = appendRegister4Section(value, option.slice("__pick__:".length));
      if (next !== null) onChange(next);
    }
  };
  const closeCustom = () => { setCustomOpen(false); setCustom(""); setCustomError(""); };
  const addCustom = () => {
    const next = appendRegister4Section(value, custom);
    if (next === null) { setCustomError(t("register4.sectionInvalid")); return; }
    const code = normalizeRegister4SectionCode(custom);
    setDraftCodes(previous => previous.includes(code) ? previous : [...previous, code]);
    onChange(next);
    closeCustom();
  };
  return (
    <div className="register4-section-field">
      <div className="register4-section-field__row">
        <div className="register4-section-field__select">
          <AppSelectField
            id={id} label={label} value="__current__" onChange={choose}
            options={options} helper={error || helper} error={error} required={required}
          />
        </div>
        <div className="register4-section-field__separator" aria-hidden="true" />
        <button
          ref={triggerRef}
          className="register4-section-field__add"
          type="button"
          onClick={() => { setCustomOpen(true); setCustomError(""); }}
          aria-label={t("register4.sectionAddNew")}
          aria-haspopup="dialog"
          aria-expanded={customOpen}
        >
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          {t("register4.sectionAddNew")}
        </button>
      </div>
      <Popover
        open={customOpen} anchorEl={triggerRef.current} onClose={closeCustom}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { className: "register4-section-field__popover" } }}
      >
        <div className="register4-section-field__popover-content">
          <h3 className="register4-section-field__popover-title">{t("register4.sectionAddNew")}</h3>
          <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); addCustom(); }}>
            <AppTextField
              id={id + "-custom"} label={t("register4.sectionCustomLabel")}
              value={custom} onChange={next => { setCustom(next); setCustomError(""); }}
              error={customError || undefined} placeholder="182(4)" maxLength={24} compact
            />
            <div className="register4-section-field__actions">
              <SecondaryButton type="button" size="sm" onClick={closeCustom}>{t("register4.sectionCancel")}</SecondaryButton>
              <PrimaryButton type="submit" size="sm">{t("register4.sectionAdd")}</PrimaryButton>
            </div>
          </form>
        </div>
      </Popover>
    </div>
  );
}
