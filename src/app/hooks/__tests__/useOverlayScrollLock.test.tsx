import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOverlayScrollLock } from "../useOverlayScrollLock";

describe("Existing modal and overlay scroll lock compatibility", () => {
  it("does not mutate the body while the overlay is closed", () => {
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    try {
      document.body.style.overflow = "scroll";
      document.body.style.paddingRight = "12px";
      const { unmount } = renderHook(() => useOverlayScrollLock(false));
      expect(document.body.style.overflow).toBe("scroll");
      expect(document.body.style.paddingRight).toBe("12px");
      unmount();
    } finally {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    }
  });

  it("retains the same scrollbar compensation and restores both original styles", () => {
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const originalClientWidth = Object.getOwnPropertyDescriptor(document.documentElement, "clientWidth");
    try {
      Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
      Object.defineProperty(document.documentElement, "clientWidth", { value: 985, configurable: true });
      document.body.style.overflow = "scroll";
      document.body.style.paddingRight = "12px";
      const { unmount } = renderHook(() => useOverlayScrollLock(true));
      expect(document.body.style.overflow).toBe("hidden");
      expect(document.body.style.paddingRight).toBe("15px");
      unmount();
      expect(document.body.style.overflow).toBe("scroll");
      expect(document.body.style.paddingRight).toBe("12px");
    } finally {
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
      else delete (window as { innerWidth?: number }).innerWidth;
      if (originalClientWidth) Object.defineProperty(document.documentElement, "clientWidth", originalClientWidth);
      else delete (document.documentElement as { clientWidth?: number }).clientWidth;
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    }
  });
});
