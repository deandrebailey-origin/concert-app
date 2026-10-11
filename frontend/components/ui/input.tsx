import * as React from "react";
import { cn } from "@/frontend/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-12 w-full rounded-md border border-[#e6e3ec] bg-white px-4 text-sm text-[#17141f] outline-none transition placeholder:text-[#96919f] focus:border-[#7c5cdb] focus:ring-4 focus:ring-[#a98bff]/25", className)} {...props} />
));
Input.displayName = "Input";
