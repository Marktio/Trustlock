import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { approveAction, raiseDisputeAction, revisionAction } from "@/app/actions";
import { ConfirmForm } from "@/components/confirm-form";
import { fmtDateTime, timeLeftLong } from "@/components/format";
import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { Notices, Pill } from "@/components/ui";
import { DomainError } from "@/domain/errors";
import { feeFor, formatSC } from "@/domain/money";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Review delivery" };

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const viewer = await requireViewer(["client"]);
  const { id } = await params;
  const sp = await searchParams;
  const { svc } = await getContainer();

  let view;
  try {
    view = await svc.getContractView(toActor(viewer), id);
  } catch (e) {
    if (e instanceof DomainError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const money = (v: number) => formatSC(v, true, viewer.currency);
  const { contract: c, freelancer, timeline, actions } = view;
  // Only a delivered contract is reviewed here. Anything else goes back to the contract page.
  if (c.state !== "delivered" || !c.deliverable) redirect(`/contracts/${c.id}`);

  const d = c.deliverable;
  const fee = feeFor(c.amount, c.feeBps);
  const first = freelancer.name.split(" ")[0];
  const key = randomUUID();
  const revisionsLeft = c.revisionLimit - c.revisionsUsed;
  const deliveredEvent = [...timeline].reverse().find((e) => e.action === "contract.deliver");
  const uploadedAt = deliveredEvent?.at ?? c.deliveredAt;

  return (
    <Shell viewer={viewer} active="/contracts">
      <div className="page-head">
        <div>
          <p className="crumb">
            <Link href="/contracts">Contracts</Link> / <Link href={`/contracts/${c.id}`}>{c.ref}</Link>
          </p>
          <h1>Review delivery</h1>
          <p className="muted small mono">
            {c.ref} · {c.title} · {freelancer.name}
          </p>
        </div>
        <Pill state={c.state} />
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <div className="split">
        <div className="col-main">
          <div className="card u-dirrow u-wrap u-between u-ai-center">
            <div>
              <div className="small muted">Review time left</div>
              <div className="big">{c.reviewEndsAt ? timeLeftLong(c.reviewEndsAt) : "Not started"}</div>
            </div>
            <p className="small muted u-max-260">
              The fingerprint below was recorded when {first} uploaded the file. If you do nothing, payment is released when the time runs out.
            </p>
          </div>

          <section className="card" aria-labelledby="deliv-h">
            <h2 id="deliv-h">Deliverable</h2>
            <div className="u-flex u-wrap u-between u-ai-center u-gap-3">
              <div>
                <div>
                  <strong>{d.name}</strong>
                </div>
                <span className="small muted">
                  {(d.sizeBytes / 1_048_576).toFixed(1)} MB{uploadedAt ? ` · uploaded ${fmtDateTime(uploadedAt)}` : ""}
                </span>
              </div>
              <button type="button" className="btn" disabled aria-describedby="dl-note">
                Download file
              </button>
            </div>
            <span id="dl-note" className="small muted">Simulation stores only the file name, size and fingerprint, so there is nothing to download.</span>
            <p className="hash">SHA-256 {d.sha256}</p>
            {d.note && (
              <p className="small muted">
                {first}&apos;s note: “{d.note}”
              </p>
            )}
          </section>

          <section className="card" aria-labelledby="opts-h">
            <h2 id="opts-h">Your options</h2>
            <div className="btn-row">
              {actions.includes("approve") && (
                <ConfirmForm
                  action={approveAction}
                  hidden={{ id: c.id, key }}
                  triggerLabel="Approve and release payment"
                  title="Release payment?"
                  confirmLabel="Release payment"
                >
                  <p>
                    {money(c.amount - fee)} goes to {freelancer.name} and {money(fee)} to the platform. Release is final and cannot be undone.
                  </p>
                </ConfirmForm>
              )}
              {actions.includes("request_revision") ? (
                <details>
                  <summary className="btn u-nolist u-pointer u-fit">
                    Request revision ({c.revisionsUsed} of {c.revisionLimit} used)
                  </summary>
                  <form action={revisionAction} className="field u-mt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <label htmlFor="rev-reason">What needs to change?</label>
                    <textarea id="rev-reason" name="reason" required minLength={3} maxLength={500} />
                    <div>
                      <SubmitButton className="btn btn-primary" pendingLabel="Sending…">Send revision request</SubmitButton>
                    </div>
                  </form>
                </details>
              ) : (
                <button type="button" className="btn" disabled aria-describedby="rev-note">
                  Request revision ({c.revisionsUsed} of {c.revisionLimit} used)
                </button>
              )}
              {actions.includes("raise_dispute") && (
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
            {revisionsLeft <= 0 && (
              <span id="rev-note" className="small muted">You have used all {c.revisionLimit} revisions.</span>
            )}
          </section>
        </div>

        <aside className="col-side" aria-label="If you approve">
          <div className="card">
            <h2>If you approve</h2>
            <div className="kv"><span>Held in escrow</span><span className="mono">{money(c.amount)}</span></div>
            <div className="kv"><span>Platform fee ({c.feeBps / 100}%)</span><span className="mono">- {money(fee)}</span></div>
            <div className="kv total"><span>{first} receives</span><span className="mono">{money(c.amount - fee)}</span></div>
            <p className="notice warn">Release is final. You will confirm once more before it happens.</p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
