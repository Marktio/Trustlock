import { redirect } from "next/navigation";
import { chooseRole } from "@/app/actions";
import { Notices } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { clerkEnabled } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Choose your role") };
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string; role?: string }> }) {
  const t = await getT();
  if (!clerkEnabled) redirect("/demo");
  const { error, role } = await searchParams;
  const picked = role === "client" || role === "freelancer" ? role : undefined;
  return (
    <main id="main" className="landing page-narrow page-onboard">
      <div>
        <h1>{t("How will you use TrustLock?")}</h1>
        <p className="muted u-mt-2">{picked ? `We pre-selected ${picked} from what you chose on the home page. Check it is right. ` : ""}{t("You can only choose this once. Arbitrator, auditor and administrator accounts are created by an administrator.")}</p>
      </div>
      <Notices error={error} />
      <form action={chooseRole} className="card">
        <fieldset className="u-b0 u-p0 u-m0 u-flex u-col u-gap-3">
          <legend className="sr-only">{t("Your role")}</legend>
          <label className="card u-dirrow u-ai-center u-gap-3">
            <input type="radio" name="role" value="client" defaultChecked={picked === "client"} required />
            <span>
              <strong>{t("Client")}</strong>
              <br />
              <span className="small muted">{t("I hire and pay for work.")}</span>
            </span>
          </label>
          <label className="card u-dirrow u-ai-center u-gap-3">
            <input type="radio" name="role" value="freelancer" defaultChecked={picked === "freelancer"} required />
            <span>
              <strong>{t("Freelancer")}</strong>
              <br />
              <span className="small muted">{t("I deliver work and get paid.")}</span>
            </span>
          </label>
        </fieldset>
        <div>
          <SubmitButton pendingLabel={t("Saving…")}>{t("Continue")}</SubmitButton>
        </div>
      </form>
    </main>
  );
}
