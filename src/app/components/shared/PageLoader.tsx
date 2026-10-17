import { useTranslation } from "react-i18next";

export function PageLoader() {
  const { t } = useTranslation("common");
  return (
    <div className="page-loader" aria-label={t("accessibility.loadingPage")} aria-live="polite">
      <div className="page-loader__spinner" aria-hidden="true" />
    </div>
  );
}
