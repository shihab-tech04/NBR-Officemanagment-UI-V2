import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PrimaryButton } from "../PrimaryButton";
import { SecondaryButton } from "../SecondaryButton";
import { DangerButton } from "../DangerButton";

const approved = [
  { Button: PrimaryButton, className: "app-btn--primary" },
  { Button: SecondaryButton, className: "app-btn--secondary" },
  { Button: DangerButton, className: "app-btn--danger" },
] as const;

function FixtureIcon({ size, strokeWidth }: { size?: number; strokeWidth?: number }) {
  return <svg data-testid="leading-icon" width={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

describe("Approved button DOM and interaction compatibility", () => {
  for (const { Button, className } of approved) {
    it(`preserves ${className} default DOM, classes and click behavior`, () => {
      const onClick = vi.fn();
      const { container } = render(<Button onClick={onClick}>Save</Button>);
      const button = screen.getByRole("button", { name: "Save" });
      expect(container.querySelectorAll("button")).toHaveLength(1);
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveClass("app-btn", className, "app-btn--md");
      expect(button.className).toBe(`app-btn ${className} app-btn--md`);
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it(`preserves ${className} size, class order, icon, and submit type`, () => {
      render(<Button icon={FixtureIcon} size="sm" fullWidth className="caller-class" type="submit">Add</Button>);
      const button = screen.getByRole("button", { name: "Add" });
      expect(button.className).toBe(`app-btn ${className} app-btn--sm app-btn--full caller-class`);
      expect(button).toHaveAttribute("type", "submit");
      const icon = screen.getByTestId("leading-icon");
      expect(icon).toHaveAttribute("width", "14");
      expect(icon).toHaveAttribute("stroke-width", "2");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it(`preserves ${className} disabled and loading restrictions`, () => {
      const onClick = vi.fn();
      const { rerender } = render(<Button disabled onClick={onClick}>Delete</Button>);
      let button = screen.getByRole("button", { name: "Delete" });
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(onClick).not.toHaveBeenCalled();
      rerender(<Button loading icon={FixtureIcon} onClick={onClick}>Delete</Button>);
      button = screen.getByRole("button", { name: "Delete" });
      expect(button).toBeDisabled();
      expect(button.className).toBe(`app-btn ${className} app-btn--md app-btn--loading`);
      expect(button.querySelector(".app-btn__spinner")).not.toBeNull();
      expect(button.querySelector("[data-testid='leading-icon']")).toBeNull();
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  }
});
