import { verifyChainAction } from "@/app/actions";
import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/components/format";
import { Notices } from "@/components/ui";
import { parseAudit } from "@/domain/audit";
import { formatSC } from "@/domain/money";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Audit log") };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const t = await getT();
  const viewer = await requireViewer(["admin", "auditor"]);
  const sp = await searchParams;
  const { svc, repo } = await getContainer();
  const [entries, recon] = await Promise.all([repo.listAudit(), svc.reconcile(toActor(viewer))]);
  const money = (v: number) => formatSC(v, true, viewer.currency);
  const rows = entries.map(parseAudit).reverse().slice(0, 100);

  return (
    <Shell viewer={viewer} active="/audit">
      <div className="page-head">
        <div>
          <h1>{t("Audit log")}</h1>
          <p className="muted">{t("Append-only. Each entry contains the fingerprint of the one before it.")}</p>
        </div>
        <form action={verifyChainAction}>
          <SubmitButton pendingLabel={t("Checking…")}>{t("Verify chain")}</SubmitButton>
        </form>
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <section className="card" aria-labelledby="recon-h">
        <div className="u-flex u-between u-wrap u-gap-2">
          <h2 id="recon-h">{t("Ledger reconciliation")}</h2>
          <span className={`pill tone-${recon.balanced ? "green" : "red"}`}>{recon.balanced ? t("Ledger balanced") : t("Ledger out of balance")}</span>
        </div>
        <p className="small">
          {t("Wallets")} <span className="mono">{money(recon.available)}</span> {t("+ held")} <span className="mono">{money(recon.held)}</span> {t("+ fees")}{" "}
          <span className="mono">{money(recon.fees)}</span> {t("= credits issued")} <span className="mono">{money(recon.issued)}</span>
        </p>
      </section>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">{t("Time (UTC)")}</th>
              <th scope="col">{t("Actor")}</th>
              <th scope="col">{t("Action")}</th>
              <th scope="col">{t("Result")}</th>
              <th scope="col">{t("Fingerprint")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.seq}>
                <td className="num">{e.seq}</td>
                <td>{fmtDateTime(e.at, t)}</td>
                <td>{e.actorRole}</td>
                <td>{e.action}</td>
                <td>
                  <span className={`pill tone-${e.result === "ok" ? "green" : "red"}`}>{e.result === "ok" ? t("Done") : t("Rejected")}</span>
                </td>
                <td className="mono">{e.hash.slice(0, 6)}..{e.hash.slice(-4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
