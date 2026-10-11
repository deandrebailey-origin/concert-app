import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";

const brand = Fraunces({ subsets: ["latin"], weight: "500", variable: "--font-brand", display: "swap" });

export const metadata: Metadata = {
  title: "Certifi — Find your people, find your show",
  description: "Meet your concert people and find live music worth going out for.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={brand.variable}><body suppressHydrationWarning>{children}</body></html>;
}
