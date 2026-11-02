import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { setRegion } from "@/app/actions";
import { clerkAppearance } from "@/components/clerk-theme";
import { RegionPicker } from "@/components/region-picker";
import { currencyLabel } from "@/domain/money";
import { clerkEnabled } from "@/server/auth";
import { PICKER_COUNTRIES, countryName, getRegion } from "@/server/region";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TrustLock", template: "%s · TrustLock" },
  description: "A practice escrow for freelance jobs. Funds are locked until both sides confirm. Simulation only.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111b33",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const region = await getRegion();
  const countries = PICKER_COUNTRIES.includes(region.country) ? PICKER_COUNTRIES : [region.country, ...PICKER_COUNTRIES];
  const options = countries.map((c) => ({ country: c, label: countryName(c) }));
  const page = (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div className="sim" role="note">
          <span>
            Simulation only: no real money is used anywhere in TrustLock. Amounts in {currencyLabel(region.currency)} ({region.currency}) are practice credits and are not converted.
          </span>
          <RegionPicker action={setRegion} options={options} value={region.source === "choice" ? region.country : "auto"} />
        </div>
        {children}
      </body>
    </html>
  );
  return clerkEnabled ? <ClerkProvider appearance={clerkAppearance}>{page}</ClerkProvider> : page;
}
