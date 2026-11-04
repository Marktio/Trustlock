import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { clerkAppearance } from "@/components/clerk-theme";
import { PopoverDismiss } from "@/components/popover-dismiss";
import { SimBar } from "@/components/sim-bar";
import { clerkEnabled } from "@/server/auth";
import { PICKER_COUNTRIES, getRegion } from "@/server/region";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TrustLock", template: "%s · TrustLock" },
  description: "A practice escrow for freelance jobs. Funds are locked until both sides confirm. Simulation only.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#111b33" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1124" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const region = await getRegion();
  const countries = PICKER_COUNTRIES.includes(region.country) ? PICKER_COUNTRIES : [region.country, ...PICKER_COUNTRIES];
  const page = (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <SimBar region={region} countries={countries} />
        <PopoverDismiss />
        {children}
      </body>
    </html>
  );
  return clerkEnabled ? <ClerkProvider appearance={clerkAppearance}>{page}</ClerkProvider> : page;
}
