import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TableRow } from "../modulePageUtils";
import { getLocalControlOptions, saveLocalAuditControl, type ControlStatus } from "./auditLocalControlStore";
import { AppModal } from "../../components/modals/AppModal";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppTextArea } from "../../components/forms/AppTextArea";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";

export function AuditLocalControlActions({ row }: { row: TableRow | null }) {
  const { i18n } = useTranslation();
  const bn = i18n.resolvedLanguage?.startsWith("bn");
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<ControlStatus | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  if (!row) return null;
  const options = getLocalControlOptions(String(row.control_status ?? "Pending") as ControlStatus);
  const label = (en:string,bangla:string) => bn ? bangla : en;
  const save = () => {
    if (!next || saving.current || !row) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      saveLocalAuditControl(String(row.id),next,note);
      setOpen(false);
      setNext("");
      setNote("");
      toast.success(label("Control review saved on this device.", "কন্ট্রোল পর্যালোচনা এই ডিভাইসে সংরক্ষিত হয়েছে।"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Control review could not be saved");
    } finally {
      setBusy(false);
      saving.current = false;
    }
  };
  return (
    <>
      {options.length > 0 && (
        <PrimaryButton size="sm" onClick={() => { setNext(options[0]);setNote("");setError("");setOpen(true); }}>
          {label("Review control","কন্ট্রোল পর্যালোচনা")}
        </PrimaryButton>
      )}
      <AppModal open={open} layer="top" size="md"
        title={label("Review control", "কন্ট্রোল পর্যালোচনা")}
        onClose={() => { if (!busy) setOpen(false); }}
        footer={
          <>
            <SecondaryButton size="sm" disabled={busy} onClick={() => setOpen(false)}>{label("Cancel","বাতিল")}</SecondaryButton>
            <PrimaryButton size="sm" loading={busy} disabled={busy || !next || note.trim().length < 10}
              onClick={save}>{label("Save review","পর্যালোচনা সংরক্ষণ")}</PrimaryButton>
          </>
        }
      >
        <div className="form-stack">
          <p>{String(row.return_id)} · {String(row.flag_id)} · {String(row.check)}</p>
          <AppSelectField id="local-audit-control-status"
            label={label("Next control status","পরবর্তী কন্ট্রোল অবস্থা")}
            value={next} onChange={(value) => setNext(value as ControlStatus)}
            options={options} required />
          <AppTextArea id="local-audit-control-reason"
            label={label("Review reason","পর্যালোচনার কারণ")}
            value={note} onChange={setNote} required rows={4}
            helper={label("10–500 characters","১০–৫০০ অক্ষর")}
            error={error || undefined} />
          {error && <p role="alert">{error}</p>}
        </div>
      </AppModal>
    </>
  );
}
