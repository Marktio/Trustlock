import Link from "next/link";
import { redirect } from "next/navigation";
import { currencyLabel, formatSC } from "@/domain/money";
import { Shell } from "@/components/shell";
import { nextStep, needsAction } from "@/components/next-step";
import { ContractTable, Notices, type ContractRow } from "@/components/ui";
import { toActor, requireViewer } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; filter?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;

  if (viewer.role === "admin") redirect("/admin");
  if (viewer.role === "auditor") redirect("/audit");

  if (viewer.role === "arbitrator") {
    const { svc: arbSvc } = await getContainer();
    const cases = await arbSvc.listDisputes(toActor(viewer));
    return (
      <Shell viewer={viewer} active="/dashboard">
        <div>
          <h1>My cases</h1>
          <p className="muted">Disputed contracts waiting for a ruling, oldest first. The money stays held until you decide.</p>
        </div>
        <Notices error={sp.error} ok={sp.ok} />
        {cases.length === 0 ? (
          <div className="card">
            <p>No open cases. Disputes will appear here when a client or freelancer raises one.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Contract</th>
                  <th scope="col">Client and freelancer</th>
                  <th scope="col" className="num">Held ({currencyLabel(viewer.currency)})</th>
                  <th scope="col">Case</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(({ contract, client, freelancer }) => (
                  <tr key={contract.id}>
                    <td>
                      <strong>{contract.title}</strong>
                      <div className="small muted mono">{contract.ref}</div>
                    </td>
                    <td>
                      {client.name} and {freelancer.name}
                    </td>
                    <td className="num">{formatSC(contract.amount, false)}</td>
                    <td>
                      <Link className="btn" href={`/cases/${contract.id}`}>
                        Open case
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Shell>
    );
  }

  const { svc } = await getContainer();
  const actor = toActor(viewer);
  const [list, wallet] = await Promise.all([svc.listContracts(actor), svc.getWallet(actor)]);
  const rows: ContractRow[] = list.map((r) => ({ ...r, next: nextStep(r.contract, r.viewerKind, r.counterpart?.name ?? "the other party", r.awaiting) }));
  const urgent = rows.find((r) => needsAction(r.contract, r.viewerKind, r.awaiting));
  const ENDED = ["completed", "refunded", "rejected", "cancelled", "expired", "resolved_split"];
  const filter = ["all", "active", "disputed", "completed"].includes(sp.filter ?? "") ? (sp.filter as string) : "all";
  const shown = rows.filter((r) => {
    const st = r.contract.state;
    if (filter === "active") return !ENDED.includes(st) && st !== "disputed";
    if (filter === "disputed") return st === "disputed";
    // "Completed" means the money is settled, however it ended: paid out, refunded or split by an arbitrator.
    if (filter === "completed") return st === "completed" || st === "refunded" || st === "resolved_split";
    return true;
  });
  const reviewing = urgent?.contract.state === "delivered" && urgent.viewerKind === "client";
  const hour = new Date().getUTCHours() + 3; // Nairobi time, UTC+3
  const greeting = hour % 24 < 12 ? "Good morning" : hour % 24 < 17 ? "Good afternoon" : "Good evening";

  return (
    <Shell viewer={viewer} active="/dashboard">
      <div className="page-head">
        <div>
          <h1>
            {greeting}, {viewer.name.split(" ")[0]}
          </h1>
          <p className="muted">
            {rows.length} {rows.length === 1 ? "contract" : "contracts"} · {urgent ? (reviewing ? "1 needs your review" : "1 needs your action") : "nothing needs you right now"}
          </p>
        </div>
        {viewer.role === "client" && (
          <Link className="btn btn-primary" href="/contracts/new">
            Create contract
          </Link>
        )}
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <div className="grid-2">
        <section className="card" aria-labelledby="wallet-h">
          <h2 id="wallet-h">My wallet</h2>
          <div className="u-flex u-gap-8 u-wrap">
            <div>
              <div className="small muted">Available</div>
              <div className="big">{formatSC(wallet.balances.available, false)}</div>
            </div>
            <div>
              <div className="small muted">Held in escrow</div>
              <div className="big held">{formatSC(wallet.balances.held, false)}</div>
            </div>
          </div>
          <div className="btn-row">
            <Link className="btn btn-primary" href="/wallet#money-form">
              {viewer.role === "client" ? "Top up" : "Withdraw"}
            </Link>
            <Link className="btn" href="/wallet#history">
              History
            </Link>
          </div>
        </section>

        <section className="card focus" aria-labelledby="action-h">
          <h2 id="action-h">Needs your action</h2>
          {urgent ? (
            <>
              <p>
                <strong>{urgent.contract.title}</strong>
                {reviewing ? ` was delivered by ${urgent.counterpart?.name ?? "the freelancer"}.` : ""}
              </p>
              <p className="muted">{reviewing ? `File fingerprint recorded. ${urgent.next.replace("Review now. ", "")}` : urgent.next}</p>
              <div>
                <Link className="btn btn-primary" href={reviewing ? `/contracts/${urgent.contract.id}/review` : `/contracts/${urgent.contract.id}`}>
                  {reviewing ? "Review delivery" : "Open contract"}
                </Link>
              </div>
            </>
          ) : (
            <p className="muted">You are all caught up.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="contracts-h" className="u-flex u-col u-gap-3">
        <div className="u-flex u-wrap u-between u-gap-2 u-ai-center">
          <h2 id="contracts-h">My contracts</h2>
          <nav aria-label="Filter contracts" className="btn-row">
            {(["all", "active", "disputed", "completed"] as const).map((f) => (
              <Link key={f} href={`/dashboard?filter=${f}`} className={`chip${filter === f ? " on" : ""}`} aria-current={filter === f ? "true" : undefined}>
                {f[0].toUpperCase() + f.slice(1)}
              </Link>
            ))}
          </nav>
        </div>
        {shown.length === 0 && rows.length === 0 && viewer.role === "client" ? (
          <div className="card">
            <p>No contracts yet. Create your first contract.</p>
            <div>
              <Link className="btn btn-primary" href="/contracts/new">
                Create contract
              </Link>
            </div>
          </div>
        ) : (
          <ContractTable currency={viewer.currency} rows={shown} empty={rows.length === 0 ? "No contracts yet." : "No contracts match this filter."} />
        )}
        
      </section>
    </Shell>
  );
}
