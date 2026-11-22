/** Shared step state only. Presentation, validation and navigation remain with each wizard. */
export interface StepState {
  completed: boolean;
  current: boolean;
  future: boolean;
}

/** Zero-based step indices; no clamping so invalid selections remain detectable. */
export function resolveStepState(index: number, currentStep: number): StepState {
  return {
    completed: index < currentStep,
    current: index === currentStep,
    future: index > currentStep,
  };
}

/** Preserve the existing shared AppStepper's completed/current navigation contract. */
export function canNavigateStepper(
  state: StepState,
  hasChangeHandler: boolean,
  allowCompletedNavigation: boolean,
): boolean {
  return hasChangeHandler && (state.current || (allowCompletedNavigation && state.completed));
}
