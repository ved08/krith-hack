import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

type FieldWrapperProps = {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  labelClassName?: string;
  className?: string;
};

export function FieldWrapper({
  label,
  hint,
  error,
  children,
  labelClassName = "",
  className = "",
}: FieldWrapperProps) {
  return (
    <label className={`block ${className}`}>
      <span
        className={`mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600 ${labelClassName}`}
      >
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-accent-700">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500 leading-relaxed">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const INPUT_BASE =
  "block w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:bg-white disabled:bg-slate-50 disabled:text-slate-500";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ invalid, className = "", ...rest }, ref) => (
  <input
    ref={ref}
    className={`${INPUT_BASE} ${invalid ? "border-accent-400 focus:border-accent-500 focus:ring-accent-100" : ""} ${className}`}
    {...rest}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ invalid, className = "", ...rest }, ref) => (
  <textarea
    ref={ref}
    className={`${INPUT_BASE} min-h-[96px] resize-y ${invalid ? "border-accent-400 focus:border-accent-500 focus:ring-accent-100" : ""} ${className}`}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ invalid, className = "", children, ...rest }, ref) => (
  <select
    ref={ref}
    className={`${INPUT_BASE} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%23736953%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z%22 clip-rule=%22evenodd%22/></svg>')] bg-[length:1.1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9 ${invalid ? "border-accent-400 focus:border-accent-500 focus:ring-accent-100" : ""} ${className}`}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = "Select";
