import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI FlowOS",
  description: "AI-automatisering voor installatiebedrijven.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="nl"><body>{children}</body></html>;
}
