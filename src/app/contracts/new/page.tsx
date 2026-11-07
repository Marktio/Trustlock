import { createContractAction } from "@/app/actions";
import { NewContractForm } from "@/components/new-contract-form";
import { Shell } from "@/components/shell";
import { Notices } from "@/components/ui";
import { requireViewer } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Create contract") };
}

export default async function NewContract({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getT();
  const viewer = await requireViewer(["client"]);
  const { error } = await searchParams;
  const cfg = await (await getContainer()).svc.getConfig();
  return (
    <Shell viewer={viewer} active="/contracts">
      <div>
        <h1>{t("Create contract")}</h1>
        <p className="muted">{t("Add the details and milestones. The freelancer sees the fee before they accept.")}</p>
      </div>
      <Notices error={error} />
      <NewContractForm action={createContractAction} feeBps={cfg.feeBps} currency={viewer.currency} draftKey={viewer.id} defaultReviewDays={cfg.defaultReviewDays} defaultRevisionLimit={cfg.defaultRevisionLimit} />
    </Shell>
  );
}
