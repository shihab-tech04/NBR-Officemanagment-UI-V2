import { Check } from "lucide-react";
import { canNavigateStepper, resolveStepState } from "../../utils/stepState";

export interface AppStepperStep {
  id: string;
  label: string;
}

interface AppStepperProps {
  steps: AppStepperStep[];
  currentStep: number;
  onStepChange?: (index: number) => void;
  ariaLabel: string;
  allowCompletedNavigation?: boolean;
}

export function AppStepper({
  steps,
  currentStep,
  onStepChange,
  ariaLabel,
  allowCompletedNavigation = true,
}: AppStepperProps) {
  return (
    <nav className="app-stepper" aria-label={ariaLabel}>
      <ol className="app-stepper__list">
        {steps.map((step, index) => {
          const { completed, current } = resolveStepState(index, currentStep);
          const canNavigate = canNavigateStepper(
            { completed, current, future: index > currentStep },
            !!onStepChange,
            allowCompletedNavigation,
          );
          return (
            <li
              key={step.id}
              className={[
                "app-stepper__item",
                current ? "app-stepper__item--current" : "",
                completed ? "app-stepper__item--done" : "",
              ].filter(Boolean).join(" ")}
            >
              <button
                type="button"
                className="app-stepper__button"
                onClick={() => canNavigate && onStepChange?.(index)}
                disabled={!canNavigate}
                aria-current={current ? "step" : undefined}
              >
                <span className="app-stepper__number" aria-hidden="true">
                  {completed ? <Check size={13} strokeWidth={2.5} /> : index + 1}
                </span>
                <span className="app-stepper__label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
