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
  "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const SIZES: Record<Size, string> = {
  sm: "rounded-lg px-3 py-1.5 text-xs",
  md: "rounded-lg px-4 py-2.5 text-sm",
  lg: "rounded-xl px-6 py-3 text-base",
  xl: "rounded-xl px-8 py-4 text-lg",
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-slate-900 text-white shadow-glow hover:bg-slate-800 active:scale-95 focus-visible:ring-slate-500",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 active:scale-95 focus-visible:ring-slate-300",
  accent:
    "bg-slate-700 text-white shadow-glow-pink hover:bg-slate-600 active:scale-95 focus-visible:ring-accent-500",
  ghost:
    "bg-transparent text-slate-900 hover:bg-slate-100 active:scale-95 focus-visible:ring-slate-300",
  outline:
    "border-2 border-slate-300 text-slate-900 hover:bg-slate-100 active:scale-95 focus-visible:ring-slate-300",
  danger:
    "bg-red-600 text-white shadow-lg hover:bg-red-500 hover:scale-105 active:scale-95 focus-visible:ring-red-500",
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
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
