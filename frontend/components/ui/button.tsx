import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/frontend/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      primary: "bg-[#17211c] text-white shadow-[0_5px_12px_rgba(23,33,28,.14)] hover:-translate-y-0.5 hover:bg-[#26372e]",
      outline: "border border-[#e3e8e2] bg-white text-[#17211c] hover:border-[#b8c3b9] hover:bg-[#fbfcfa]",
      ghost: "text-[#66716b] hover:bg-[#f0f3ee] hover:text-[#17211c]",
    },
    size: { default: "h-12 px-5 text-sm", sm: "h-9 px-3 text-xs" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
