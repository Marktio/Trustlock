import Link from "next/link";
import { currencyLabel, formatSC } from "@/domain/money";
import { STATE_LABEL, STATE_RAIL, type ContractState } from "@/domain/states";
import type { Contract, User } from "@/domain/types";
import { STATE_TONE } from "./format";

/** State is always text plus colour, never colour alone. */
export function Pill({ state }: { state: ContractState }) {
  return <span className={`pill tone-${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>;
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
export function StateRail({ state, steps, scrollable = true }: { state: ContractState; steps?: { state: ContractState; label: string }[]; scrollable?: boolean }) {
  const rail = steps ?? STATE_RAIL.map((st) => ({ state: st, label: STATE_LABEL[st] }));
  const idx = rail.findIndex((r) => r.state === state);
  const onRail = idx >= 0;
  return (
    <div className="rail-wrap" {...(scrollable ? { tabIndex: 0, role: "region", "aria-label": "Contract progress, scrolls sideways on small screens" } : {})}>
      <ol className="rail" aria-label="Contract progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rail.map((r, i) => {
          const s = r.state;
          const status = !onRail ? "todo" : i < idx ? "done" : i === idx ? "now" : "todo";
          return (
            <li key={s} style={{ display: "contents" }}>
              {i > 0 && <span className={`rail-line ${onRail && i <= idx ? "done" : ""}`} aria-hidden="true" />}
              <span className={`rail-step ${status}`} aria-current={status === "now" ? "step" : undefined}>
                <span className="rail-dot" aria-hidden="true" />
                {r.label}
                {status === "done" && <span className="sr-only"> (done)</span>}
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

export function ContractTable({ rows, empty = "No contracts yet.", currency }: { rows: ContractRow[]; empty?: string; currency?: string }) {
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
            <th scope="col">ID</th>
            <th scope="col">Contract</th>
            <th scope="col" className="num">Amount ({unit})</th>
            <th scope="col">State</th>
            <th scope="col">Next step</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ contract, counterpart, viewerKind, next }) => (
            <tr key={contract.id}>
              <td data-label="ID">
                <span className="mono">{contract.ref}</span>
              </td>
              <td>
                <Link className="row-link" href={`/contracts/${contract.id}`}>
                  {contract.title}
                </Link>
                <div className="small muted">
                  {viewerKind === "client" ? "Freelancer" : "Client"}: {counterpart?.name ?? "Unknown"}
                </div>
              </td>
              <td className="num" data-label={`Amount (${unit})`}>{formatSC(contract.amount, false)}</td>
              <td data-label="State">
                <Pill state={contract.state} />
              </td>
              <td data-label="Next step">{next}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
