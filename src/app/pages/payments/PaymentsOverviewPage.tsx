import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** Navigation landing only. Does not create payment data, roles or workflows. */
export function PaymentsOverviewPage() {
  const { t } = useTranslation("navigation");

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page__title">{t("payments.main")}</h1>
      <p className="dashboard-page__subtitle">{t("payments.summary")}</p>
      <section aria-label={t("payments.currentTools")}>
        <h2>{t("payments.currentTools")}</h2>
        <p>
          <Link to="/case-financial/demand-payment/demand-entry">
            {t("payments.openCurrentTools")}
          </Link>
        </p>
      </section>
    </div>
  );
}
