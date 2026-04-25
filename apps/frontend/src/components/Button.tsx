import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "accent"
  | "outline";
type Size = "sm" | "md" | "lg" | "xl";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium tracking-wide transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper-50";

const SIZES: Record<Size, string> = {
  sm: "rounded-full px-3 py-1.5 text-xs",
  md: "rounded-full px-4 py-2 text-sm",
  lg: "rounded-full px-6 py-2.5 text-sm",
  xl: "rounded-full px-7 py-3 text-base",
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-slate-900 text-paper-50 shadow-subtle hover:bg-slate-800 active:scale-[0.98] focus-visible:ring-slate-500",
  secondary:
    "bg-paper-100 text-slate-900 border border-slate-200 hover:bg-slate-100 active:scale-[0.98] focus-visible:ring-slate-300",
  accent:
    "bg-primary-600 text-paper-50 shadow-glow hover:bg-primary-700 active:scale-[0.98] focus-visible:ring-primary-500",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] focus-visible:ring-slate-300",
  outline:
    "border border-slate-300 text-slate-900 bg-transparent hover:bg-slate-50 active:scale-[0.98] focus-visible:ring-slate-300",
  danger:
    "bg-accent-600 text-paper-50 hover:bg-accent-700 active:scale-[0.98] focus-visible:ring-accent-500",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      className = "",
      icon,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
        {...rest}
      >
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
