import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { clerkAppearance } from "@/components/clerk-theme";
import { PopoverDismiss } from "@/components/popover-dismiss";
import { SimBar } from "@/components/sim-bar";
import { clerkEnabled } from "@/server/auth";
import { PICKER_COUNTRIES, getRegion } from "@/server/region";
import { getTheme } from "@/server/theme";
import "./globals.css";
import { getT } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import { SW } from "@/i18n/sw";
import { getLang } from "@/server/lang";

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
  const t = await getT();
  const lang = await getLang();
  const region = await getRegion();
  const theme = await getTheme();
  const countries = PICKER_COUNTRIES.includes(region.country) ? PICKER_COUNTRIES : [region.country, ...PICKER_COUNTRIES];
  const page = (
    <html lang={lang} data-theme={theme === "system" ? undefined : theme} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          {t("Skip to main content")}
        </a>
        <I18nProvider lang={lang} dict={lang === "sw" ? SW : undefined}>
          <SimBar region={region} countries={countries} theme={theme} lang={lang} />
          <PopoverDismiss />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
  return clerkEnabled ? <ClerkProvider appearance={clerkAppearance}>{page}</ClerkProvider> : page;
}
