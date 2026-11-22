import { describe, expect, it } from "vitest";
import { canNavigateStepper, resolveStepState } from "./stepState";

describe("shared stepper state preserves existing wizard behavior", () => {
  it("marks exactly one current step and earlier steps complete", () => {
    const states = [0, 1, 2, 3].map((index) => resolveStepState(index, 2));
    expect(states).toEqual([
      { completed: true, current: false, future: false },
      { completed: true, current: false, future: false },
      { completed: false, current: true, future: false },
      { completed: false, current: false, future: true },
    ]);
  });

  it("matches the existing completed/current navigation semantics", () => {
    expect(canNavigateStepper(resolveStepState(0, 1), true, true)).toBe(true);
    expect(canNavigateStepper(resolveStepState(0, 1), true, false)).toBe(false);
    expect(canNavigateStepper(resolveStepState(1, 1), true, false)).toBe(true);
    expect(canNavigateStepper(resolveStepState(2, 1), true, true)).toBe(false);
    expect(canNavigateStepper(resolveStepState(1, 1), false, true)).toBe(false);
  });

  it("never changes the order or number of business steps", () => {
    for (const count of [3, 6]) {
      for (let active = 0; active < count; active++) {
        const states = Array.from({ length: count }, (_, index) => resolveStepState(index, active));
        expect(states.filter((state) => state.current)).toHaveLength(1);
        expect(states.filter((state) => state.completed)).toHaveLength(active);
        expect(states.filter((state) => state.future)).toHaveLength(count - active - 1);
      }
    }
  });
});
