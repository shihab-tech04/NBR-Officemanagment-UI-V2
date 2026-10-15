import { useEffect } from "react";

/**
 * Identical scroll-lock side effect shared by AppModal and ResponsiveOverlay.
 * Do not change scrollbar compensation or restoration without browser parity.
 */
export function useOverlayScrollLock(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [open]);
}
