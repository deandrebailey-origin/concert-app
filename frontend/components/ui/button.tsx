import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/frontend/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-md font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      primary: "bg-[#6d4fd1] text-white shadow-[0_5px_14px_rgba(109,79,209,.28)] hover:-translate-y-0.5 hover:bg-[#5b3fc0]",
      outline: "border border-[#e6e3ec] bg-white text-[#17141f] hover:border-[#bdb8c7] hover:bg-[#fcfbfd]",
      ghost: "text-[#6b6676] hover:bg-[#f2f0f6] hover:text-[#17141f]",
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
