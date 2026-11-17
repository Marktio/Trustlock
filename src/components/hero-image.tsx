import Image from "next/image";
import { LockKey, SealCheck } from "@phosphor-icons/react/dist/ssr";
import { formatSC } from "@/domain/money";
import { getT } from "@/i18n/server";
import vault from "@/assets/hero/vault.webp";

/**
 * Landing hero picture: a client pays into the vault, the freelancer is paid on delivery.
 * The picture has a transparent background, so it sits straight on the page wash in light and dark.
 * Two glass chips float over it, the way the product itself shows the held amount and the audit proof.
 * collab.webp and released.webp in src/assets/hero are alternates (they keep their own backgrounds).
 */
export async function HeroImage({ currency }: { currency: string }) {
  const t = await getT();
  const amount = formatSC(4_500_000, true, currency);
  return (
    <figure className="lp-vis lp-vis-img">
      <Image src={vault} alt={`${t("Example contract")}: ${t("Held in escrow")} ${amount}`} priority sizes="(max-width: 900px) 100vw, 560px" />
      <div className="lpv-chips">
        <p className="lpv-chip lpv-chip-held">
          <span className="lpv-chip-icon" aria-hidden="true">
            <LockKey size={18} weight="bold" />
          </span>
          <span>
            <span className="caption-4 lpv-chip-label">{t("Held in escrow")}</span>
            <span className="lpv-chip-amount">{amount}</span>
          </span>
        </p>
        <p className="lpv-chip lpv-chip-proof caption-2">
          <SealCheck size={16} weight="fill" aria-hidden="true" />
          <span>{t("Cryptographically verified")}</span>
          <code lang="en">hash: 9fa2…e81b</code>
        </p>
      </div>
    </figure>
  );
}
