import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { GenPage } from "../../components/pages/GeneratedTablePage";
import type { PageCfg } from "../modulePageUtils";
import { VIEW } from "../../data/modulePageConfigs";
import { Register4EntryModal } from "./Register4EntryModal";
import { Register4InlineRow } from "./Register4InlineRow";
import {
  REGISTER4_ASSESSMENT_COLUMNS,
  REGISTER4_ASSESSMENT_DRAWER_COLUMNS,
  REGISTER4_ASSESSMENT_MOBILE_MAPPING,
  REGISTER4_ASSESSMENT_ROWS,
  REGISTER4_ASSESSMENT_FILTERS,
  buildRegister4Kpis,
  buildRegister4EntryFields,
  createRegister4LocalDraft,
  nextRegister4SerialNo,
  downloadRegister4SampleCsv,
} from "./register4AssessmentTable";

export function Register4ListPage() {
  const { assessmentYear } = useSettings();
  const { t: translateActions } = useTranslation("actions");
  const { t: translatePages } = useTranslation("pages");
  const { t: translateTables } = useTranslation("tables");

  const cfg: PageCfg = {
    title: "Register-4",
    titleKey: "register4.title",
    desc: "Monthly tax assessment register.",
    descKey: "register4.desc",
    cols: REGISTER4_ASSESSMENT_COLUMNS,
    drawerCols: REGISTER4_ASSESSMENT_DRAWER_COLUMNS,
    mobileCardMapping: REGISTER4_ASSESSMENT_MOBILE_MAPPING,
    filters: REGISTER4_ASSESSMENT_FILTERS,
    assessmentYearScope: { field: "assessment_year", year: assessmentYear },
    filterDateField: "assessment_date",
    applyTableFilters: true,
    enableSort: true,
    pageSizeOptions: [10, 25, 50],
    drawerActions: VIEW,
    rows: REGISTER4_ASSESSMENT_ROWS,
    kpis: buildRegister4Kpis(REGISTER4_ASSESSMENT_ROWS),
    buildVisibleKpis: buildRegister4Kpis,
    entryBtn: translateActions("newEntry"),
    inlineEntryBtn: translatePages("register4.addRow"),
    inlineEntryComponent: Register4InlineRow,
    inlineInitialValues: rows => ({ serial_no: nextRegister4SerialNo(rows) }),
    entryModalComponent: Register4EntryModal,
    entrySubmitLabel: translatePages("register4.createNewEntry"),
    entryFields: buildRegister4EntryFields(assessmentYear, translateTables, translatePages),
    createEntryRow: createRegister4LocalDraft,
    onExportRows: rows => downloadRegister4SampleCsv(rows, translateTables),
  };
  return <GenPage cfg={cfg} />;
}
