import { useRef, useState } from "react";
import { Popover } from "@mui/material";
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

/**
 * A single compact control within the shared Register-4 form grid.
 * The custom section editor is an anchored overlay: it must NEVER insert
 * form fields/buttons into adjacent two-column rows.
 * All selections are local draft metadata, NOT verified legal outcomes.
 */
export function Register4SectionField({ id, label, value, onChange, helper, error, required }: Props) {
  const { t, i18n } = useTranslation("pages");
  const anchorRef = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState("");
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const codes = register4SectionTrail(value);
  const isBangla = i18n.language?.startsWith("bn");

  // The selected history is presented IN the existing outlined select, not
  // in an additional card or a second form field below it.
  const options = [
    { value: "__current__", label: value || t("register4.sectionChoose") },
    ...REGISTER4_SECTIONS.map(item => ({
      value: "__pick__:" + item.code,
      label: item.code + " — " + (isBangla ? item.bn : item.en),
    })),
    ...draftCodes.filter(code => !REGISTER4_SECTIONS.some(section => section.code === code)).map(code => ({
      value: "__pick__:" + code, label: code + " — " + t("register4.sectionCustomDraft"),
    })),
    { value: "__custom__", label: t("register4.sectionAddNew") },
    ...(codes.length ? [{ value: "__undo__", label: t("register4.sectionUndo") }] : []),
  ];

  const choose = (picked: string) => {
    if (picked === "__custom__") {
      setCustomOpen(true);
      setCustomError("");
    } else if (picked === "__undo__") {
      onChange(undoRegister4Section(value));
    } else if (picked.startsWith("__pick__:")) {
      const next = appendRegister4Section(value, picked.slice("__pick__:".length));
      if (next !== null) onChange(next);
    }
  };

  const closeCustom = () => {
    setCustomOpen(false);
    setCustom(""); setCustomError("");
  };

  const addCustom = () => {
    const next = appendRegister4Section(value, custom);
    if (next === null) {
      setCustomError(t("register4.sectionInvalid"));
      return;
    }
    const normalized = normalizeRegister4SectionCode(custom);
    setDraftCodes(current => current.includes(normalized) ? current : [...current, normalized]);
    onChange(next);
    closeCustom();
  };

  return (
    <div className="register4-section-field" ref={anchorRef}>
      <AppSelectField
        id={id}
        label={label}
        value="__current__"
        onChange={choose}
        options={options}
        helper={error || helper}
        error={error}
        required={required}
      />
      <Popover
        open={customOpen}
        anchorEl={anchorRef.current}
        onClose={closeCustom}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { className: "register4-section-field__popover" } }}
      >
        <div className="register4-section-field__popover-content">
          <h3 className="register4-section-field__popover-title">{t("register4.sectionCustomLabel")}</h3>
          <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); addCustom(); }}>
            <AppTextField
              id={id + "-custom"}
              label={t("register4.sectionCustomLabel")}
              value={custom}
              onChange={next => { setCustom(next); setCustomError(""); }}
              error={customError || undefined}
              placeholder="182(4)"
              maxLength={24}
            />
            <p className="register4-section-field__note">{t("register4.sectionUnverified")}</p>
            <div className="register4-section-field__actions">
              <SecondaryButton type="button" onClick={closeCustom}>{t("register4.sectionCancel")}</SecondaryButton>
              <PrimaryButton type="submit">{t("register4.sectionAdd")}</PrimaryButton>
            </div>
          </form>
        </div>
      </Popover>
    </div>
  );
}
