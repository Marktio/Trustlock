import { notFound } from "next/navigation";
import Link from "next/link";
import { requestInfoAction, resolveDisputeAction } from "@/app/actions";
import { ConfirmForm } from "@/components/confirm-form";
import { ACTION_LABEL, fmtDateTime } from "@/components/format";
import { Shell } from "@/components/shell";
import { Notices } from "@/components/ui";
import { DomainError } from "@/domain/errors";
import { feeFor, formatSC } from "@/domain/money";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Dispute case") };
}

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const t = await getT();
  const viewer = await requireViewer(["arbitrator"]);
  const { id } = await params;
  const sp = await searchParams;
  const { svc } = await getContainer();

  let view;
  try {
    view = await svc.getDisputeView(toActor(viewer), id);
  } catch (e) {
    if (e instanceof DomainError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const { contract: c, client, freelancer, timeline, messages, dispute, caseFile } = view;
  const money = (v: number) => formatSC(v, true, viewer.currency);
  const fee = feeFor(c.amount, c.feeBps);
  const nameOf = (actorId: string | null) => (actorId === client.id ? client.name : actorId === freelancer.id ? freelancer.name : "System");

  return (
    <Shell viewer={viewer} active="/dashboard">
      <div className="page-head">
        <div>
          <p className="crumb">
            <Link href="/dashboard">{t("My cases")}</Link> / <span className="mono">{c.ref}</span>
          </p>
          <h1>{c.title}</h1>
          <p className="muted small">
            {client.name} {t("(client) and")} {freelancer.name} {t("(freelancer)")}
          </p>
        </div>
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <div className="split">
        <div className="col-main">
          <section className="card held" aria-labelledby="dispute-h">
            <h2 id="dispute-h">{t("The dispute")}</h2>
            <div className="big held">{money(c.amount)}</div>
            <span className="small muted">{t("Held in escrow. Platform fee at full release:")} {money(fee)}.</span>
            {dispute ? (
              <p>
                <strong>{nameOf(dispute.raisedBy)}</strong> {t("raised it on")} {fmtDateTime(dispute.at, t)}: “{dispute.reason}”
              </p>
            ) : (
              <p className="muted">{t("No reason was recorded.")}</p>
            )}
            <p className="small muted">{c.description}</p>
            {c.deliverable && (
              <p className="small">
                {t("Delivered file:")} <strong>{c.deliverable.name}</strong> <span className="mono">{t("SHA-256")} {c.deliverable.sha256.slice(0, 12)}…</span>
                {c.deliverable.note ? ` · note: “${c.deliverable.note}”` : ""}
              </p>
            )}
          </section>

          <section className="card" aria-labelledby="msg-h">
            <h2 id="msg-h">{t("Messages between the two sides")}</h2>
            {messages.length === 0 ? (
              <p className="muted">{t("They sent no messages.")}</p>
            ) : (
              <ul className="u-nolist u-m0 u-p0 u-flex u-col u-gap-3">
                {messages.map((m) => (
                  <li key={m.seq}>
                    <div className="small muted">
                      <strong>{nameOf(m.actorId)}</strong> · {fmtDateTime(m.at, t)}
                    </div>
                    <div className="u-pre u-pre2">{m.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="ev-h">
            <h2 id="ev-h">{t("Evidence")}</h2>
            <p className="small muted">
              {caseFile.evidenceOpen ? t("The evidence window is open until {when}.", { when: fmtDateTime(caseFile.evidenceEndsAt, t) }) : t("The evidence window closed on {when}.", { when: fmtDateTime(caseFile.evidenceEndsAt, t) })} {t("Decision due by")}{" "}
              {fmtDateTime(caseFile.decisionDueAt, t)}
              {caseFile.overdue ? t(" (overdue)") : ""}.
            </p>
            {caseFile.evidence.length === 0 ? (
              <p className="muted">{t("Neither side has submitted evidence.")}</p>
            ) : (
              <ul className="u-nolist u-m0 u-p0 u-flex u-col u-gap-3">
                {caseFile.evidence.map((e) => (
                  <li key={e.seq}>
                    <div className="small muted">
                      <strong>{e.by === "client" ? client.name : freelancer.name}</strong> ({e.by}) · {fmtDateTime(e.at, t)}
                    </div>
                    {e.text && <div className="u-pre u-pre2">{e.text}</div>}
                    {e.files.map((f) => (
                      <div key={f.sha256 + f.name} className="small">
                        {f.name} <span className="mono muted">{t("SHA-256")} {f.sha256}</span>
                      </div>
                    ))}
                    <div className="small mono muted">{t("Submission fingerprint")} {e.sha256}</div>
                  </li>
                ))}
              </ul>
            )}
            {caseFile.requests.length > 0 && (
              <div>
                <h3>{t("Your questions")}</h3>
                <ul className="u-m0 u-pl6">
                  {caseFile.requests.map((r) => (
                    <li key={r.seq}>
                      {t("To")} {r.to === "client" ? client.name : freelancer.name}: “{r.question}” <span className="small muted">{r.answered ? t("Answered") : t("Waiting")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ConfirmForm action={requestInfoAction} hidden={{ id: c.id }} triggerLabel={t("Ask for more information")} title={t("Ask one side a question")} confirmLabel={t("Send question")}>
              <div className="field">
                <label htmlFor="ask-to">{t("Who are you asking?")}</label>
                <select id="ask-to" name="to" required defaultValue="">
                  <option value="" disabled>{t("Choose")}</option>
                  <option value="client">{client.name} {t("(client)")}</option>
                  <option value="freelancer">{freelancer.name} {t("(freelancer)")}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ask-q">{t("Your question")}</label>
                <textarea id="ask-q" name="question" required minLength={3} maxLength={500} />
                <span className="hint">{t("They can answer even after the evidence window has closed.")}</span>
              </div>
            </ConfirmForm>
          </section>

          <section className="card focus" aria-labelledby="ruling-h">
            <h2 id="ruling-h">{t("Your ruling")}</h2>
            <p className="small muted">{t("A ruling is final. The money moves in the same step that closes the case.")}</p>
            <ConfirmForm
              action={resolveDisputeAction}
              hidden={{ id: c.id }}
              triggerLabel={t("Record ruling")}
              title={t("Record your ruling")}
              confirmLabel={t("Record ruling")}
            >
              <fieldset className="u-b0 u-m0 u-p0 u-flex u-col u-gap-2">
                <legend className="small u-fw6">{t("Decision")}</legend>
                <label className="check">
                  <input type="radio" name="decision" value="release" required />
                  <span>{t("Pay the freelancer:")} {money(c.amount - fee)} {t("after the")} {money(fee)} {t("fee")}</span>
                </label>
                <label className="check">
                  <input type="radio" name="decision" value="refund" />
                  <span>{t("Refund the client:")} {money(c.amount)} {t("back, no fee")}</span>
                </label>
                <label className="check">
                  <input type="radio" name="decision" value="split" />
                  <span>{t("Split between them (fee comes out of the freelancer's share)")}</span>
                </label>
              </fieldset>
              <div className="field">
                <label htmlFor="pct">{t("Freelancer share for a split (1 to 99 percent)")}</label>
                <input id="pct" name="freelancerPercent" type="number" min={1} max={99} step={1} />
              </div>
              <div className="field">
                <label htmlFor="note">{t("Reason for your ruling")}</label>
                <textarea id="note" name="note" required minLength={3} maxLength={500} />
                <span className="hint">{t("Both sides will see this in the timeline.")}</span>
              </div>
            </ConfirmForm>
          </section>
        </div>

        <aside className="col-side" aria-label={t("Timeline")}>
          <div className="card">
            <h2>{t("Timeline")}</h2>
            <ol className="tl">
              {timeline.map((e) => (
                <li key={e.seq}>
                  <div>
                    <div>
                      {t(ACTION_LABEL[e.action] ?? e.action)} <span className="muted">{t("by")} {nameOf(e.actorId)}</span>
                    </div>
                    <span className="small muted">
                      {fmtDateTime(e.at, t)} {t("· audit #")}{e.seq}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
