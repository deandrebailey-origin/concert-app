"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/frontend/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("grid h-11 grid-cols-2 rounded-md bg-[#f3f1f6] p-1", className)} {...props} />
));
TabsList.displayName = TabsPrimitive.List.displayName;
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn("rounded-lg px-3 text-sm font-semibold text-[#6b6676] transition data-[state=active]:bg-white data-[state=active]:text-[#17141f] data-[state=active]:shadow-sm", className)} {...props} />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-6 outline-none", className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
