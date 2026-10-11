import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certifi — Find your people, find your show",
  description: "Meet your concert people and find live music worth going out for.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
