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

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ invalid, className = "", children, ...rest }, ref) => (
  <select
    ref={ref}
    className={`${INPUT_BASE} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z%22 clip-rule=%22evenodd%22/></svg>')] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9 ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = "Select";
