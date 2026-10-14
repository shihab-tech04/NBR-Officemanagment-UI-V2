import { useTranslation } from "react-i18next";
import { GenPage } from "../../components/pages/GeneratedTablePage";
import type { PageCfg } from "../modulePageUtils";
import { reg4Rows, BASE_FILTERS } from "../modulePageUtils";
import {
  REGISTER4_ASSESSMENT_COLUMNS,
  REGISTER4_ASSESSMENT_MOBILE_MAPPING,
  REGISTER4_ASSESSMENT_ROWS,
} from "./register4AssessmentTable";
import { ROW_VIEW, VIEW } from "../../data/modulePageConfigs";
import { buildPageKpis } from "../../utils/buildPageKpis";

export function Register4ListPage() {
  const { t: translateActions } = useTranslation("actions");

  const kpis = buildPageKpis(reg4Rows, {
    totalLabel: "Total Records",
    statusField: "status",
    statuses: [
      { value: "Pending", label: "Pending", tone: "warning" },
      { value: "Issued", label: "Issued", tone: "success" },
      { value: "Returned", label: "Returned", tone: "neutral" },
    ],
  });

  const cfg: PageCfg = {
    title: "Register-4 List",
    titleKey: "register4.title",
    desc: "Review Register-4 entries and related form records.",
    descKey: "register4.desc",
    cols: REGISTER4_ASSESSMENT_COLUMNS,
    mobileCardMapping: REGISTER4_ASSESSMENT_MOBILE_MAPPING,
    filters: BASE_FILTERS,
    actions: ROW_VIEW,
    drawerActions: VIEW,
    rows: REGISTER4_ASSESSMENT_ROWS,
    entryBtn: translateActions("newEntry"),
    kpis,
  };
  return <GenPage cfg={cfg} />;
}
