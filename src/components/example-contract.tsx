import { LockKey } from "@phosphor-icons/react/dist/ssr";
import { formatSC } from "@/domain/money";
import { StateRail } from "@/components/ui";
import { getT } from "@/i18n/server";

/**
 * The example contract shown on the landing page and beside the sign-in forms.
 * It is the real StateRail with the seeded "Brand identity refresh" contract, not a drawing.
 */
export async function ExampleContract({ currency }: { currency: string }) {
  const t = await getT();
  return (
    <aside className="lp-contract" aria-label={t("Example contract")}>
      <div className="lp-contract-head">
        <div>
          <p className="caption-4 lp-muted">{t("Example contract")}</p>
          <h2 className="heading-6">{t("Brand identity refresh")}</h2>
        </div>
        <span className="lp-badge caption-3">{t("Funded")}</span>
      </div>
      <dl className="lp-parties">
        <div>
          <dt className="caption-4 lp-muted">{t("Client")}</dt>
          <dd className="title-3">{t("Amina W.")}</dd>
        </div>
        <div>
          <dt className="caption-4 lp-muted">{t("Freelancer")}</dt>
          <dd className="title-3">{t("Brian O.")}</dd>
        </div>
      </dl>
      <div className="lp-rail">
        <StateRail
          scrollable={false}
          state="funded"
          steps={[
            { state: "draft", label: "Draft" },
            { state: "proposed", label: "Proposed" },
            { state: "accepted", label: "Accepted" },
            { state: "funded", label: "Funded" },
            { state: "delivered", label: "Delivered" },
            { state: "completed", label: "Done" },
          ]}
        />
      </div>
      <div className="lp-held">
        <p className="body-5 lp-held-label">
          <LockKey size={20} weight="bold" aria-hidden="true" />
          {t("Held in escrow")}
        </p>
        <p className="lp-amount">{formatSC(4_500_000, true, currency)}</p>
        <p className="caption-2 lp-held-note">{t("Released only after both sides confirm delivery.")}</p>
      </div>
    </aside>
  );
}
