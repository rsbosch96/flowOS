import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const variants = cva("inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50", {
  variants: { variant: { default: "bg-blue-600 text-white hover:bg-blue-700", secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200", outline: "border border-slate-300 bg-white hover:bg-slate-50" } },
  defaultVariants: { variant: "default" },
});

export function Button({ className, variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return <button className={cn(variants({ variant }), className)} {...props} />;
}
