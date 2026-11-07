import { randomUUID } from "node:crypto";
import Link from "next/link";
import { topUpAction, withdrawAction } from "@/app/actions";
import { MoneyDialog } from "@/components/money-dialog";
import { Shell } from "@/components/shell";
import { fmtDateTime } from "@/components/format";
import { Notices } from "@/components/ui";
import { currencyLabel, formatSC } from "@/domain/money";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Wallet") };
}

function kindOf(memo: string, delta: number, isClient = false): { label: string; tone: string; filter: "locked" | "credits" | "refunds" | "other" } {
  if (memo.startsWith("Top-up")) return { label: "Credit", tone: "green", filter: "credits" };
  if (memo.startsWith("Escrow funded")) return { label: "Locked", tone: "amber", filter: "locked" };
  if (memo.startsWith("Dispute ruling")) return delta >= 0 ? (isClient ? { label: "Refund", tone: "blue", filter: "refunds" } : { label: "Credit", tone: "green", filter: "credits" }) : { label: "Debit", tone: "grey", filter: "other" };
  if (memo.startsWith("Withdraw")) return { label: "Withdrawal", tone: "grey", filter: "other" };
  if (memo.toLowerCase().includes("refund")) return { label: "Refund", tone: "blue", filter: "refunds" };
  return delta >= 0 ? { label: "Credit", tone: "green", filter: "credits" } : { label: "Debit", tone: "grey", filter: "other" };
}

const FILTERS = ["all", "locked", "credits", "refunds"] as const;
const DAY = 86_400_000;
const clock = () => {
  const d = new Date();
  return { now: d.getTime(), monthStart: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) };
};

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; type?: string; range?: string }> }) {
  const t = await getT();
  const viewer = await requireViewer(["client", "freelancer"]);
  const sp = await searchParams;
  const { svc } = await getContainer();
  const { balances, entries } = await svc.getWallet(toActor(viewer));
  const cfg = await svc.getConfig();
  const mine = entries.filter((e) => e.account.endsWith(":available"));
  const isClient = viewer.role === "client";
  const money = (v: number) => formatSC(v, true, viewer.currency);
  const unit = currencyLabel(viewer.currency);

  const type = (FILTERS as readonly string[]).includes(sp.type ?? "") ? (sp.type as (typeof FILTERS)[number]) : "all";
  const range = sp.range === "all" ? "all" : "30";
  const { now, monthStart: startOfMonth } = clock();
  const receivedMinor = mine
    .filter((e) => e.delta > 0 && !e.memo.startsWith("Top-up") && new Date(e.createdAt).getTime() >= startOfMonth)
    .reduce((sum, e) => sum + e.delta, 0);

  const shown = mine.filter((e) => {
    const k = kindOf(e.memo, e.delta, isClient);
    if (type !== "all" && k.filter !== type) return false;
    if (range === "30" && now - new Date(e.createdAt).getTime() > 30 * DAY) return false;
    return true;
  });
  const href = (t: string, r: string) => `/wallet?type=${t}&range=${r}#history`;

  return (
    <Shell viewer={viewer} active="/wallet">
      <div className="page-head">
        <div>
          <h1>{t("Wallet")}</h1>
          <p className="muted">{t("Every movement has a matching debit and credit, so balances always add up.")}</p>
        </div>
        <div className="btn-row" id="money-form">
          <MoneyDialog
            action={isClient ? topUpAction : withdrawAction}
            idemKey={randomUUID()}
            triggerLabel={isClient ? t("Top up (simulated)") : t("Withdraw (simulated)")}
            unit={unit}
            title={isClient ? t("Top up (simulated)") : t("Withdraw (simulated)")}
            submitLabel={isClient ? t("Top up wallet") : t("Withdraw")}
            hint={isClient ? t("From {min} to {max} at a time, up to {day} a day.", { min: money(cfg.topUpMin), max: money(cfg.topUpMax), day: money(cfg.topUpDailyMax) }) : t("Moves your available balance to a simulated destination.")}
          />
          <a className="btn" href="/wallet/export" download>
            {t("Export CSV")}
          </a>
        </div>
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <div className="grid-3">
        <div className="card">
          <div className="small muted">{t("Available")}</div>
          <div className="big">{money(balances.available)}</div>
        </div>
        <div className="card held">
          <div className="small muted">{t("Held in escrow")}</div>
          <div className="big held">{money(balances.held)}</div>
        </div>
        <div className="card">
          <div className="small muted">{t("Received this month")}</div>
          <div className="big">{money(receivedMinor)}</div>
        </div>
      </div>

      <section id="history" aria-labelledby="hist-h" className="u-flex u-col u-gap-3">
        <h2 id="hist-h">{t("History")}</h2>
        <div className="u-flex u-wrap u-between u-gap-2">
          <nav aria-label={t("Filter by type")} className="btn-row">
            {FILTERS.map((f) => (
              <Link key={f} href={href(f, range)} className={`chip${type === f ? " on" : ""}`} aria-current={type === f ? "true" : undefined}>
                {t(f[0].toUpperCase() + f.slice(1))}
              </Link>
            ))}
          </nav>
          <Link href={href(type, range === "30" ? "all" : "30")} className="chip" aria-label={range === "30" ? t("Showing last 30 days. Show all time") : t("Showing all time. Show last 30 days")}>
            {range === "30" ? t("Last 30 days") : t("All time")}
          </Link>
        </div>
        {shown.length === 0 ? (
          <div className="card">
            <p>
              {mine.length === 0
                ? `${t("No transactions yet.")} ${isClient ? t("Top up your wallet to fund a contract.") : t("You will see payments here after a client approves your work.")}`
                : t("No transactions match this filter.")}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t("Date (UTC)")}</th>
                  <th scope="col">{t("Description")}</th>
                  <th scope="col">{t("Type")}</th>
                  <th scope="col" className="num">{t("Amount (")}{unit})</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => {
                  const k = kindOf(e.memo, e.delta, isClient);
                  const m = /\s(TX-[A-Z0-9]+)$/.exec(e.memo);
                  const desc = m ? e.memo.slice(0, m.index) : e.memo || "Transaction";
                  return (
                    <tr key={`${e.txId}-${i}`}>
                      <td>{fmtDateTime(e.createdAt, t)}</td>
                      <td>
                        {t(desc)}
                        {m && (
                          <div className="small muted mono">{m[1]}</div>
                        )}
                      </td>
                      <td>
                        <span className={`pill tone-${k.tone}`}>{t(k.label)}</span>
                      </td>
                      <td className="num">
                        {e.delta >= 0 ? "+ " : "- "}
                        {formatSC(Math.abs(e.delta), false)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
