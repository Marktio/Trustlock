import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  acceptAction,
  acceptCounterAction,
  cancelAction,
  cancelFundedAction,
  declineCancelAction,
  counterProposeAction,
  declineCounterAction,
  submitEvidenceAction,
  deliverAction,
  fundAction,
  rejectAction,
  raiseDisputeAction,
  sendMessageAction,
  startWorkAction,
  withdrawDisputeAction,
} from "@/app/actions";
import { ConfirmForm } from "@/components/confirm-form";
import { CounterForm } from "@/components/counter-form";
import { EvidenceForm } from "@/components/evidence-form";
import { DeliverForm } from "@/components/deliver-form";
import { ACTION_LABEL, fmtDate, fmtDateTime } from "@/components/format";
import { nextStep } from "@/components/next-step";
import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { Notices, Pill, StateRail } from "@/components/ui";
import { DomainError } from "@/domain/errors";
import { feeFor, formatSC } from "@/domain/money";
import { STATE_LABEL, STATE_RAIL, isTerminal } from "@/domain/states";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Contract" };

const SHOWS_HELD = ["funded", "in_progress", "delivered", "approved", "disputed"];

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const viewer = await requireViewer(["client", "freelancer"]);
  const { id } = await params;
  const sp = await searchParams;
  const { svc, repo } = await getContainer();

  let view;
  try {
    view = await svc.getContractView(toActor(viewer), id);
  } catch (e) {
    // Not found and not yours look the same, so contract ids cannot be probed (NFR-1.5).
    if (e instanceof DomainError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const money = (v: number) => formatSC(v, true, viewer.currency);
  const { contract: c, viewerKind, client, freelancer, timeline, actions, messages, dispute, terms, caseFile, evidence } = view;
  const termsVersion = terms.version;
  const latestCounter = terms.history.length > 1 ? terms.history[terms.history.length - 1] : null;
  const isClient = viewerKind === "client";
  const other = isClient ? freelancer : client;
  const can = (a: (typeof actions)[number]) => actions.includes(a);
  const fee = feeFor(c.amount, c.feeBps);
  const balances = isClient ? await repo.getBalances(viewer.id) : null;
  const key = randomUUID();
  const nameOf = (actorId: string | null) => (actorId === client.id ? client.name : actorId === freelancer.id ? freelancer.name : "System");

  return (
    <Shell viewer={viewer} active="/contracts">
      <div className="page-head">
        <div>
          <p className="crumb">
            <Link href="/contracts">Contracts</Link> / <span className="mono">{c.ref}</span>
          </p>
          <h1>{c.title}</h1>
          <p className="muted small">
            {client.name} (client) and {freelancer.name} (freelancer)
          </p>
        </div>
        <Pill state={c.state} />
      </div>

      <Notices error={sp.error} ok={sp.ok} />
      <div className="card">
        <StateRail state={c.state} />
        {!STATE_RAIL.includes(c.state) && (
          <p className="small muted">
            {c.state === "disputed" ? (
              <>This contract is in <strong>dispute</strong>.</>
            ) : (
              <>This contract ended as <strong>{STATE_LABEL[c.state]}</strong>.</>
            )}
          </p>
        )}
      </div>

      <div className="split">
        <div className="col-main">
          {SHOWS_HELD.includes(c.state) && (
            <div className="card held">
              <div className="small muted">Held in escrow</div>
              <div className="big held">{money(c.amount)}</div>
              <p className="small muted">Neither of you can spend or withdraw it. It moves only when work is approved.</p>
              {c.milestones.length > 0 && (
                <p className="small muted">
                  {c.milestones.length} {c.milestones.length === 1 ? "milestone" : "milestones"} · first due{" "}
                  {fmtDate([...c.milestones].sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0].dueDate)}
                </p>
              )}
            </div>
          )}

          <section className="card focus" aria-labelledby="next-h">
            <h2 id="next-h">{isTerminal(c.state) ? "Outcome" : "Next required action"}</h2>
            <p>{nextStep(c, viewerKind, other.name, terms.awaiting)}</p>

            {/* Client answers a counter-proposal */}
            {c.state === "proposed" && latestCounter && terms.awaiting === "client" && (
              <div className="notice warn" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <strong>{freelancer.name} proposed new terms (version {latestCounter.version})</strong>
                {latestCounter.note && <span>“{latestCounter.note}”</span>}
                <div className="kv"><span>Total</span><span className="mono">{latestCounter.previous ? `${money(latestCounter.previous.amount)} → ` : ""}{money(latestCounter.terms.amount)}</span></div>
                <div className="kv"><span>Review period</span><span>{latestCounter.previous ? `${latestCounter.previous.reviewPeriodDays} → ` : ""}{latestCounter.terms.reviewPeriodDays} days</span></div>
                <div className="kv"><span>Revisions</span><span>{latestCounter.previous ? `${latestCounter.previous.revisionLimit} → ` : ""}{latestCounter.terms.revisionLimit}</span></div>
                <span className="small muted">The milestones are listed under Terms below.</span>
              </div>
            )}
            {can("accept_counter") && (
              <div className="btn-row">
                <form action={acceptCounterAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="btn btn-go" pendingLabel="Accepting…">Accept new terms</SubmitButton>
                </form>
                <ConfirmForm action={declineCounterAction} hidden={{ id: c.id }} triggerLabel="Decline" title="Decline the new terms?" confirmLabel="Decline and cancel" tone="danger">
                  <p>The contract is cancelled. Nothing was funded, so nothing moves.</p>
                  <div className="field">
                    <label htmlFor="decline-reason">Why are you declining?</label>
                    <textarea id="decline-reason" name="reason" required minLength={3} maxLength={500} />
                  </div>
                </ConfirmForm>
              </div>
            )}
            {can("counter_propose") && (
              <details>
                <summary className="btn" style={{ listStyle: "none", cursor: "pointer", width: "fit-content" }}>Counter-propose</summary>
                <CounterForm
                  action={counterProposeAction}
                  contractId={c.id}
                  currency={viewer.currency}
                  initial={{
                    total: formatSC(c.amount, false),
                    reviewPeriodDays: c.reviewPeriodDays,
                    revisionLimit: c.revisionLimit,
                    milestones: c.milestones.map((m) => ({ title: m.title, dueDate: m.dueDate, amount: formatSC(m.amount, false) })),
                  }}
                />
              </details>
            )}

            {/* Freelancer replies to a proposal */}
            {can("accept") && (
              <div className="btn-row">
                <form action={acceptAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="btn btn-go" pendingLabel="Accepting…">Accept contract</SubmitButton>
                </form>
              </div>
            )}
            {can("reject") && (
              <details>
                <summary className="btn" style={{ listStyle: "none", cursor: "pointer", width: "fit-content" }}>Reject with reason</summary>
                <form action={rejectAction} className="field" style={{ marginTop: "var(--space-3)" }}>
                  <input type="hidden" name="id" value={c.id} />
                  <label htmlFor="reject-reason">Why are you rejecting it?</label>
                  <textarea id="reject-reason" name="reason" required minLength={3} maxLength={500} />
                  <div>
                    <SubmitButton className="btn btn-danger" pendingLabel="Rejecting…">Reject contract</SubmitButton>
                  </div>
                </form>
              </details>
            )}

            {/* Client funds */}
            {can("fund") && balances && (
              <ConfirmForm
                action={fundAction}
                hidden={{ id: c.id, key }}
                triggerLabel={`Fund ${money(c.amount)}`}
                title={`You are about to lock ${money(c.amount)}`}
                confirmLabel={`Confirm and lock ${money(c.amount)}`}
              >
                <div className="kv"><span>Available now</span><span className="mono">{money(balances.available)}</span></div>
                <div className="kv"><span>Amount to lock</span><span className="mono">- {money(c.amount)}</span></div>
                <div className="kv total"><span>Available after</span><span className="mono">{money(balances.available - c.amount)}</span></div>
                <div className="kv"><span>Platform fee (taken at release)</span><span className="mono">{money(fee)}</span></div>
                <p className="notice warn">
                  The money moves to Held. Neither of you can spend or withdraw it. It is released only when you approve delivery.
                </p>
                {balances.available < c.amount && (
                  <p className="notice error" role="alert">
                    Your balance is {money(c.amount - balances.available)} short. <Link href="/wallet">Top up your wallet</Link> first.
                  </p>
                )}
              </ConfirmForm>
            )}

            {/* Freelancer starts work */}
            {can("start_work") && (
              <form action={startWorkAction}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton pendingLabel="Starting…">Start work</SubmitButton>
              </form>
            )}

            {/* Client reviews on a dedicated screen (S10) */}
            {isClient && c.state === "delivered" && c.deliverable && (
              <div className="btn-row">
                <Link className="btn btn-primary" href={`/contracts/${c.id}/review`}>
                  Review delivery
                </Link>
              </div>
            )}

            {/* Cancel */}
            {can("cancel") && (
              <ConfirmForm
                action={cancelAction}
                hidden={{ id: c.id }}
                triggerLabel="Cancel contract"
                title="Cancel this contract?"
                confirmLabel="Cancel contract"
                tone="danger"
              >
                <p>No money has moved, so cancelling costs nothing. The other party will be told.</p>
              </ConfirmForm>
            )}

            {can("mutual_cancel") && (
              view.cancelRequestedBy === viewer.id ? (
                <p className="small muted">You asked to cancel. The contract is cancelled when the other person agrees too.</p>
              ) : view.cancelRequestedBy ? (
                <div className="notice warn">
                  <p>The other person asked to cancel this funded contract. If you agree, the held money goes back to the client.</p>
                  <div className="btn-row">
                    <ConfirmForm action={cancelFundedAction} hidden={{ id: c.id }} triggerLabel="Agree to cancel" title="Agree to cancel?" confirmLabel="Agree and cancel" tone="danger">
                      <p>The held money returns to the client and the contract ends.</p>
                    </ConfirmForm>
                    <ConfirmForm action={declineCancelAction} hidden={{ id: c.id }} triggerLabel="Keep the contract" title="Keep the contract going?" confirmLabel="Keep going">
                      <p>The contract carries on. If you cannot agree, either side can raise a dispute.</p>
                    </ConfirmForm>
                  </div>
                </div>
              ) : (
                <ConfirmForm action={cancelFundedAction} hidden={{ id: c.id }} triggerLabel="Ask to cancel" title="Ask to cancel this contract?" confirmLabel="Send request" tone="danger">
                  <p>The money is held, so cancelling needs the other person to agree. If they do, it goes back to the client. If not, either side can raise a dispute.</p>
                </ConfirmForm>
              )
            )}

            {!isClient && c.state === "in_progress" && c.revisionReason && (
              <p className="notice warn">Revision requested: “{c.revisionReason}”</p>
            )}
            {c.state === "completed" && (
              <div>
                <div className="kv"><span>Paid to {freelancer.name.split(" ")[0]}</span><span className="mono">{money(c.amount - fee)}</span></div>
                <div className="kv"><span>Platform fee</span><span className="mono">{money(fee)}</span></div>
              </div>
            )}
            {c.state === "disputed" && dispute && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <p className="notice warn">
                  <strong>{nameOf(dispute.raisedBy)}</strong> raised a dispute on {fmtDateTime(dispute.at)}: “{dispute.reason}”
                </p>
                <p className="small muted">
                  {caseFile?.assignedName
                    ? `${caseFile.assignedName} is the arbitrator. The money stays held until they rule.`
                    : "Waiting for an administrator to assign an arbitrator. The money stays held until they rule."}{" "}
                  The dispute can only be withdrawn if both sides agree.
                </p>
              </div>
            )}
            {can("withdraw_dispute") && (view.dispute?.withdrawRequestedBy === viewer.id ? (
              <p className="small muted">You asked to withdraw this dispute. It ends when the other person agrees too.</p>
            ) : (
              <ConfirmForm
                action={withdrawDisputeAction}
                hidden={{ id: c.id }}
                triggerLabel={view.dispute?.withdrawRequestedBy ? "Agree to withdraw dispute" : "Ask to withdraw dispute"}
                title={view.dispute?.withdrawRequestedBy ? "Agree to withdraw the dispute?" : "Ask to withdraw the dispute?"}
                confirmLabel={view.dispute?.withdrawRequestedBy ? "Agree and withdraw" : "Send request"}
              >
                <p>
                  {view.dispute?.withdrawRequestedBy
                    ? "The other person wants to withdraw. If you agree, the contract goes back to where it was before the dispute. A delivered contract gets a fresh review period."
                    : "The dispute ends only when both sides agree. The money stays held until then."}
                </p>
              </ConfirmForm>
            ))}
            <div className="btn-row">
              {c.state !== "draft" && (
                <a className="btn" href="#messages">
                  Message
                </a>
              )}
              {can("raise_dispute") && (
                <ConfirmForm
                  action={raiseDisputeAction}
                  hidden={{ id: c.id }}
                  triggerLabel="Raise dispute"
                  title="Raise a dispute?"
                  confirmLabel="Raise dispute"
                  tone="danger"
                >
                  <p>The money stays held and an arbitrator decides. Try messaging first: most problems are solved there.</p>
                  <div className="field">
                    <label htmlFor="dispute-reason">What went wrong?</label>
                    <textarea id="dispute-reason" name="reason" required minLength={3} maxLength={500} />
                  </div>
                </ConfirmForm>
              )}
            </div>
          </section>

          {!isClient && c.state === "in_progress" && can("deliver") && <DeliverForm action={deliverAction} contractId={c.id} reviewDays={c.reviewPeriodDays} />}

          {caseFile && (
            <section className="card" id="evidence" aria-labelledby="ev-h">
              <h2 id="ev-h">Evidence</h2>
              <p className="small muted">
                {caseFile.evidenceOpen ? `The evidence window is open until ${fmtDateTime(caseFile.evidenceEndsAt)}.` : `The evidence window closed on ${fmtDateTime(caseFile.evidenceEndsAt)}.`} The arbitrator is asked to decide by{" "}
                {fmtDateTime(caseFile.decisionDueAt)}. Evidence is fingerprinted and cannot be edited or removed.
              </p>
              {caseFile.requests.map((r) => (
                <p key={r.seq} className={r.answered ? "notice" : "notice warn"}>
                  <strong>The arbitrator asked {r.to === viewerKind ? "you" : r.to === "client" ? client.name : freelancer.name}:</strong> “{r.question}”{" "}
                  <span className="small muted">{r.answered ? "Answered." : r.to === viewerKind ? "Please answer below." : "Waiting for an answer."}</span>
                </p>
              ))}
              {caseFile.evidence.length === 0 ? (
                <p className="muted">No evidence has been submitted yet.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {caseFile.evidence.map((e) => (
                    <li key={e.seq}>
                      <div className="small muted">
                        <strong>{e.by === "client" ? client.name : freelancer.name}</strong> · {fmtDateTime(e.at)}
                      </div>
                      {e.text && <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.text}</div>}
                      {e.files.map((f) => (
                        <div key={f.sha256 + f.name} className="small">
                          {f.name} <span className="mono muted">SHA-256 {f.sha256.slice(0, 12)}…</span>
                        </div>
                      ))}
                      <div className="small mono muted">Fingerprint {e.sha256.slice(0, 16)}…</div>
                    </li>
                  ))}
                </ul>
              )}
              {evidence.canSubmit ? (
                <EvidenceForm action={submitEvidenceAction} contractId={c.id} filesLeft={evidence.filesLeft} />
              ) : (
                <p className="small muted">You cannot add evidence right now. If the arbitrator asks you a question, you can answer it here.</p>
              )}
            </section>
          )}

          <section className="card" aria-labelledby="terms-h">
            <h2 id="terms-h">Terms (version {termsVersion})</h2>
            <div className="kv"><span>Total</span><strong className="mono">{money(c.amount)}</strong></div>
            <div className="kv"><span>Review period</span><span>{c.reviewPeriodDays} {c.reviewPeriodDays === 1 ? "day" : "days"}, then auto-approve</span></div>
            <div className="kv"><span>Revisions</span><span>{c.revisionLimit}</span></div>
            <div className="kv"><span>Platform fee</span><span>{c.feeBps / 100}% ({money(fee)}), taken at release</span></div>
            <ul style={{ margin: 0, paddingLeft: "var(--space-6)" }}>
              {c.milestones.map((m, i) => (
                <li key={i}>
                  {m.title} · due {fmtDate(m.dueDate)} · <span className="mono">{money(m.amount)}</span>
                </li>
              ))}
            </ul>
            {terms.history.length > 1 && (
              <details>
                <summary className="small" style={{ cursor: "pointer" }}>Version history ({terms.history.length} versions)</summary>
                <ol className="small" style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-6)" }}>
                  {terms.history.map((v) => (
                    <li key={v.version}>
                      Version {v.version} by {v.by === "client" ? client.name : freelancer.name}: <span className="mono">{money(v.terms.amount)}</span>, {v.terms.milestones.length} {v.terms.milestones.length === 1 ? "milestone" : "milestones"}, {v.terms.reviewPeriodDays} review days, {v.terms.revisionLimit} revisions
                      {v.note ? ` · “${v.note}”` : ""}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {c.expiresAt && <p className="small muted">{c.state === "proposed" ? "Proposal expires" : "Funding deadline"}: {fmtDateTime(c.expiresAt)}</p>}
          </section>

          <section className="card" id="messages" aria-labelledby="msg-h">
            <h2 id="msg-h">Messages</h2>
            <p className="small muted">Messages go into the audit log, so they cannot be edited or removed. An arbitrator can read them.</p>
            {messages.length === 0 ? (
              <p className="muted">No messages yet.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {messages.map((m) => (
                  <li key={m.seq}>
                    <div className="small muted">
                      <strong>{nameOf(m.actorId)}</strong> · {fmtDateTime(m.at)}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.detail}</div>
                  </li>
                ))}
              </ul>
            )}
            {!isTerminal(c.state) && (
              <form action={sendMessageAction} className="field">
                <input type="hidden" name="id" value={c.id} />
                <label htmlFor="msg-body">Write a message to {other.name.split(" ")[0]}</label>
                <textarea id="msg-body" name="body" required maxLength={1000} />
                <div>
                  <SubmitButton pendingLabel="Sending…">Send message</SubmitButton>
                </div>
              </form>
            )}
          </section>
        </div>

        <aside className="col-side" aria-label="Timeline">
          <div className="card">
            <h2>Timeline</h2>
            <ol className="tl">
              {timeline.map((e) => (
                <li key={e.seq}>
                  <div>
                    <div>
                      {ACTION_LABEL[e.action] ?? e.action} <span className="muted">by {nameOf(e.actorId)}</span>
                    </div>
                    {["contract.reject", "contract.cancel", "contract.request_revision", "contract.raise_dispute", "contract.rule_release", "contract.rule_refund", "contract.rule_split"].includes(e.action) && e.detail && (
                      <div className="small">“{e.detail}”</div>
                    )}
                    <span className="small muted">
                      {fmtDateTime(e.at)} · <Link href={`/contracts/${c.id}/audit#audit-${e.seq}`}>audit #{e.seq}</Link>
                    </span>
                  </div>
                </li>
              ))}
              {!isTerminal(c.state) && (
                <li className="pending">
                  <div>
                    <div className="muted">Review, approval and release</div>
                    <span className="small muted">Pending</span>
                  </div>
                </li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
