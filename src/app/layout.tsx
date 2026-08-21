import type { Metadata } from "next";
import "./globals.css";
import { getPreferredLanguage } from "@/i18n/server";
import { resolveProductLocale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "AI FlowOS",
  description: "AI-automatisering voor installatiebedrijven.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const language = await getPreferredLanguage();
  return <html lang={resolveProductLocale(language)}><body>{children}</body></html>;
}
