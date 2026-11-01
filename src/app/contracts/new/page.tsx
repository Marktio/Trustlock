import { createContractAction } from "@/app/actions";
import { NewContractForm } from "@/components/new-contract-form";
import { Shell } from "@/components/shell";
import { Notices } from "@/components/ui";
import { requireViewer } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Create contract" };

export default async function NewContract({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await requireViewer(["client"]);
  const { error } = await searchParams;
  const cfg = await (await getContainer()).svc.getConfig();
  return (
    <Shell viewer={viewer} active="/contracts">
      <div>
        <h1>Create contract</h1>
        <p className="muted">Add the details and milestones. The freelancer sees the fee before they accept.</p>
      </div>
      <Notices error={error} />
      <NewContractForm action={createContractAction} feeBps={cfg.feeBps} currency={viewer.currency} draftKey={viewer.id} defaultReviewDays={cfg.defaultReviewDays} defaultRevisionLimit={cfg.defaultRevisionLimit} />
    </Shell>
  );
}
