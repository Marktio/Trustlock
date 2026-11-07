import Link from "next/link";
import { Shell } from "@/components/shell";
import { nextStep } from "@/components/next-step";
import { ContractTable, Notices, type ContractRow } from "@/components/ui";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Contracts") };
}

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const t = await getT();
  const viewer = await requireViewer(["client", "freelancer"]);
  const sp = await searchParams;
  const { svc } = await getContainer();
  const list = await svc.listContracts(toActor(viewer));
  const rows: ContractRow[] = list.map((r) => ({ ...r, next: nextStep(r.contract, r.viewerKind, r.counterpart?.name ?? "the other party", r.awaiting, t) }));
  return (
    <Shell viewer={viewer} active="/contracts">
      <div className="page-head">
        <h1>{t("Contracts")}</h1>
        {viewer.role === "client" && (
          <Link className="btn btn-primary" href="/contracts/new">
            {t("Create contract")}
          </Link>
        )}
      </div>
      <Notices error={sp.error} ok={sp.ok} />
      <ContractTable currency={viewer.currency} rows={rows} />
    </Shell>
  );
}
