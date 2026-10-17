import { SelectedCheckmark } from "./SelectedCheckmark";
import { useTranslation } from "react-i18next";

export type LanguageId = "en" | "bn";

export interface LanguageConfig {
  id: LanguageId;
  name: string;
  nativeName: string;
  icon: string;
}

interface LanguageOptionCardProps {
  language: LanguageConfig;
  selected: boolean;
  onSelect: (id: LanguageId) => void;
}

export function LanguageOptionCard({ language, selected, onSelect }: LanguageOptionCardProps) {
  const { t } = useTranslation("appearance");
  return (
    <button
      onClick={() => onSelect(language.id)}
      aria-pressed={selected}
      aria-label={`${t("language")}: ${t(`languages.${language.id}`)}`}
      className={`language-option-card ${selected ? "language-option-card--selected" : ""}`}
    >
      <div className="language-option-card__header">
        <div className="language-option-card__icon-wrapper">
          <span className="language-option-card__icon">{language.icon}</span>
          <span className={`language-option-card__title ${selected ? "language-option-card__title--selected" : "language-option-card__title--default"}`}>
            {t(`languages.${language.id}`)}
          </span>
        </div>
        <SelectedCheckmark visible={selected} color="var(--color-primary)" />
      </div>
      <span className="language-option-card__subtitle">
        {language.nativeName}
      </span>
    </button>
  );
}
