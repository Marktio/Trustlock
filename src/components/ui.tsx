import Link from "next/link";
import { currencyLabel, formatSC } from "@/domain/money";
import { STATE_LABEL, STATE_RAIL, type ContractState } from "@/domain/states";
import type { Contract, User } from "@/domain/types";
import { STATE_TONE } from "./format";
import { getT } from "@/i18n/server";

/** State is always text plus colour, never colour alone. */
export async function Pill({ state }: { state: ContractState }) {
  const t = await getT();
  return <span className={`pill tone-${STATE_TONE[state]}`}>{t(STATE_LABEL[state])}</span>;
}

export function Notices({ error, ok }: { error?: string; ok?: string }) {
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {ok && (
        <p className="notice ok" role="status">
          {ok}
        </p>
      )}
    </>
  );
}

/** The happy path from the state machine. Off-path end states (refunded, rejected...) show as a banner instead. */
export async function StateRail({ state, steps, scrollable = true }: { state: ContractState; steps?: { state: ContractState; label: string }[]; scrollable?: boolean }) {
  const t = await getT();
  const rail = steps ?? STATE_RAIL.map((st) => ({ state: st, label: t(STATE_LABEL[st]) }));
  const idx = rail.findIndex((r) => r.state === state);
  const onRail = idx >= 0;
  return (
    <div className="rail-wrap" {...(scrollable ? { tabIndex: 0, role: "region", "aria-label": t("Contract progress, scrolls sideways on small screens") } : {})}>
      <ol className="rail u-nolist u-m0 u-p0" aria-label={t("Contract progress")}>
        {rail.map((r, i) => {
          const s = r.state;
          const status = !onRail ? "todo" : i < idx ? "done" : i === idx ? "now" : "todo";
          return (
            <li key={s} className="u-contents">
              {i > 0 && <span className={`rail-line ${onRail && i <= idx ? "done" : ""}`} aria-hidden="true" />}
              <span className={`rail-step ${status}`} aria-current={status === "now" ? "step" : undefined}>
                <span className="rail-dot" aria-hidden="true" />
                {r.label}
                {status === "done" && <span className="sr-only"> {t("(done)")}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface ContractRow {
  contract: Contract;
  counterpart: User | null;
  viewerKind: "client" | "freelancer";
  /** Whose turn it is on a proposal. */
  awaiting?: "client" | "freelancer";
  next: string;
}

export async function ContractTable({ rows, empty = "No contracts yet.", currency }: { rows: ContractRow[]; empty?: string; currency?: string }) {
  const t = await getT();
  const unit = currencyLabel(currency);
  if (rows.length === 0) {
    return (
      <div className="card">
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table stack">
        <thead>
          <tr>
            <th scope="col">{t("ID")}</th>
            <th scope="col">{t("Contract")}</th>
            <th scope="col" className="num">{t("Amount (")}{unit})</th>
            <th scope="col">{t("State")}</th>
            <th scope="col">{t("Next step")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ contract, counterpart, viewerKind, next }) => (
            <tr key={contract.id}>
              <td data-label={t("ID")}>
                <span className="mono">{contract.ref}</span>
              </td>
              <td>
                <Link className="row-link" href={`/contracts/${contract.id}`}>
                  {contract.title}
                </Link>
                <div className="small muted">
                  {viewerKind === "client" ? t("Freelancer") : t("Client")}: {counterpart?.name ?? t("Unknown")}
                </div>
              </td>
              <td className="num" data-label={t("Amount ({unit})", { unit })}>{formatSC(contract.amount, false)}</td>
              <td data-label={t("State")}>
                <Pill state={contract.state} />
              </td>
              <td data-label={t("Next step")}>{next}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
