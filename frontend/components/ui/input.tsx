import * as React from "react";
import { cn } from "@/frontend/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-12 w-full rounded-xl border border-[#e3e8e2] bg-white px-4 text-sm text-[#17211c] outline-none transition placeholder:text-[#929b94] focus:border-[#78934a] focus:ring-4 focus:ring-[#c9f36b]/25", className)} {...props} />
));
Input.displayName = "Input";
