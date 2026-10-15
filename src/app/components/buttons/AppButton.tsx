import { Loader2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type LucideIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export interface AppButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  variant: "primary" | "secondary" | "danger";
}

/**
 * Internal renderer for the three existing, approved button variants.
 * Keep DOM structure, class order, icon dimensions and disabled/loading
 * semantics identical to their original individual implementations.
 * The CSS in src/styles/buttons.css remains authoritative for appearance.
 */
export function AppButton({
  children,
  onClick,
  type = "button",
  icon: Icon,
  size = "md",
  fullWidth = false,
  disabled = false,
  loading = false,
  className = "",
  variant,
}: AppButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "app-btn",
        `app-btn--${variant}`,
        `app-btn--${size}`,
        fullWidth ? "app-btn--full" : "",
        loading ? "app-btn--loading" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      {loading ? (
        <Loader2 size={14} strokeWidth={2} className="app-btn__spinner" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
