import { type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from "react";

type FieldWrapperProps = {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
};

export function FieldWrapper({ label, hint, error, children }: FieldWrapperProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const INPUT_BASE =
  "block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ invalid, className = "", ...rest }, ref) => (
  <input
    ref={ref}
    className={`${INPUT_BASE} ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`}
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
    className={`${INPUT_BASE} min-h-[96px] resize-y ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
