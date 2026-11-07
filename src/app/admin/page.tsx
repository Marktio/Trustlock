import Link from "next/link";
import {
  assignArbitratorAction,
  createStaffAction,
  reactivateUserAction,
  suspendUserAction,
  updateSettingsAction,
} from "@/app/actions";
import { ConfirmForm } from "@/components/confirm-form";
import { fmtDateTime } from "@/components/format";
import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { Notices } from "@/components/ui";
import { currencyLabel, formatSC } from "@/domain/money";
import { CONTRACT_STATES, STATE_LABEL } from "@/domain/states";
import { clerkEnabled, requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Admin dashboard") };
}

const ROLE_ORDER = ["client", "freelancer", "arbitrator", "admin", "auditor"] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; q?: string }> }) {
  const t = await getT();
  const viewer = await requireViewer(["admin"]);
  const sp = await searchParams;
  const { svc } = await getContainer();
  const actor = toActor(viewer);
  const [o, users, queue, arbitrators] = await Promise.all([svc.adminOverview(actor), svc.listUsers(actor, sp.q ?? ""), svc.listDisputeQueue(actor), svc.listArbitrators(actor)]);
  const money = (v: number) => formatSC(v, true, viewer.currency);
  const unit = currencyLabel(viewer.currency);
  const s = o.settings;

  return (
    <Shell viewer={viewer} active="/admin">
      <div>
        <h1>{t("Admin dashboard")}</h1>
        <p className="muted">{t("Platform overview, people, disputes and settings. You see contract details but never delivered files, and you cannot change ledger or audit records.")}</p>
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <section aria-labelledby="ov-h" className="u-flex u-col u-gap-4">
        <h2 id="ov-h">{t("Overview")}</h2>
        <div className="ov-grid">
          <div className="card">
            <span className="small muted">{t("Held in escrow")}</span>
            <div className="big">{money(o.held)}</div>
          </div>
          <div className="card">
            <span className="small muted">{t("Open disputes")}</span>
            <div className="big">{o.openDisputes}</div>
            <span className="small muted">{o.unassigned} {t("unassigned ·")} {o.overdue} {t("overdue")}</span>
          </div>
          <div className="card">
            <span className="small muted">{t("Rejected actions, last 24 hours")}</span>
            <div className="big">{o.rejectedLast24h}</div>
            <span className="small muted">{t("Illegal moves and failed payments. Sign-in failures are tracked by Clerk.")}</span>
          </div>
          <div className="card">
            <span className="small muted">{t("System health")}</span>
            <div className="u-flex u-col u-gap-2 u-ai-start">
              <span className={`pill tone-${o.health.ledgerBalanced ? "green" : "red"}`}>{o.health.ledgerBalanced ? t("Ledger balanced") : t("Ledger out of balance")}</span>
              <span className={`pill tone-${o.health.chainIntact ? "green" : "red"}`}>{o.health.chainIntact ? t("Audit chain intact") : t("Audit chain broken")}</span>
              <span className="small muted">{o.health.auditEntries} {t("audit entries ·")} <Link href="/audit">{t("Open audit log")}</Link></span>
            </div>
          </div>
          <div className="card">
            <span className="small muted">{t("Users by role")}</span>
            <ul className="u-nolist u-m0 u-p0">
              {ROLE_ORDER.map((r) => (
                <li key={r} className="kv"><span className="u-cap">{r}</span><strong>{o.usersByRole[r]}</strong></li>
              ))}
              <li className="kv"><span>{t("Suspended")}</span><strong>{o.suspended}</strong></li>
            </ul>
          </div>
          <div className="card">
            <span className="small muted">{t("Contracts by state (")}{o.contractCount})</span>
            <ul className="u-nolist u-m0 u-p0">
              {CONTRACT_STATES.filter((st) => o.contractsByState[st]).map((st) => (
                <li key={st} className="kv"><span>{t(STATE_LABEL[st])}</span><strong>{o.contractsByState[st]}</strong></li>
              ))}
              {o.contractCount === 0 && <li className="muted">{t("No contracts yet.")}</li>}
            </ul>
            {o.flagged > 0 && <p className="notice warn">{o.flagged} {t("live")} {o.flagged === 1 ? t("contract is") : t("contracts are")} {t("frozen because a party is suspended.")}</p>}
          </div>
        </div>
      </section>

      <section id="disputes" className="card" aria-labelledby="dq-h">
        <h2 id="dq-h">{t("Dispute queue")}</h2>
        {queue.length === 0 ? (
          <p className="muted">{t("No open disputes.")}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t("Contract")}</th>
                  <th scope="col">{t("Raised")}</th>
                  <th scope="col" className="num">{t("Held (")}{unit})</th>
                  <th scope="col">{t("Arbitrator")}</th>
                  <th scope="col">{t("Assign")}</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => (
                  <tr key={r.contract.id}>
                    <td>
                      <strong>{r.contract.title}</strong>
                      <div className="small muted">{r.client.name} {t("and")} {r.freelancer.name}</div>
                      <div className="small muted">“{r.reason}”</div>
                    </td>
                    <td>
                      {fmtDateTime(r.raisedAt, t)}
                      {r.overdue && <div><span className="pill tone-red">{t("Overdue")}</span></div>}
                      <div className="small muted">{t("Due")} {fmtDateTime(r.dueAt, t)}</div>
                    </td>
                    <td className="num mono">{formatSC(r.contract.amount, false)}</td>
                    <td>{r.assignedTo ? r.assignedTo.name : <span className="pill tone-amber">{t("Unassigned")}</span>}</td>
                    <td>
                      <form action={assignArbitratorAction} className="u-flex u-gap-2 u-wrap">
                        <input type="hidden" name="id" value={r.contract.id} />
                        <label className="sr-only" htmlFor={`arb-${r.contract.id}`}>{t("Arbitrator for")} {r.contract.title}</label>
                        <select id={`arb-${r.contract.id}`} name="arbitratorId" defaultValue="auto">
                          <option value="auto">{t("Fewest open cases")}</option>
                          {arbitrators.filter((a) => a.user.id !== r.assignedTo?.id).map((a) => (
                            <option key={a.user.id} value={a.user.id}>{a.user.name} ({a.openCases} {t("open)")}</option>
                          ))}
                        </select>
                        <SubmitButton className="btn" pendingLabel={t("Assigning…")}>{r.assignedTo ? t("Reassign") : t("Assign")}</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="users" className="card" aria-labelledby="us-h">
        <div className="page-head">
          <h2 id="us-h">{t("Users")}</h2>
          <form method="get" action="/admin#users" role="search" className="u-flex u-gap-2">
            <label className="sr-only" htmlFor="user-q">{t("Search users")}</label>
            <input id="user-q" name="q" type="text" placeholder={t("Name, email or role")} defaultValue={sp.q ?? ""} />
            <button className="btn" type="submit">{t("Search")}</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t("Name")}</th>
                <th scope="col">{t("Role")}</th>
                <th scope="col" className="num">{t("Contracts")}</th>
                <th scope="col">{t("Status")}</th>
                <th scope="col">{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(({ user, suspended, contracts }) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <div className="small muted">{user.email}</div>
                  </td>
                  <td className="u-cap">{user.role}</td>
                  <td className="num">{contracts}</td>
                  <td>{suspended ? <span className="pill tone-red">{t("Suspended")}</span> : <span className="pill tone-green">{t("Active")}</span>}</td>
                  <td>
                    {user.id === viewer.id ? (
                      <span className="small muted">{t("You")}</span>
                    ) : suspended ? (
                      <form action={reactivateUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <SubmitButton className="btn" pendingLabel={t("Reactivating…")}>{t("Reactivate")}</SubmitButton>
                      </form>
                    ) : (
                      <ConfirmForm action={suspendUserAction} hidden={{ userId: user.id }} triggerLabel={t("Suspend")} title={t("Suspend {name}?", { name: user.name })} confirmLabel={t("Suspend user")} tone="danger">
                        <p>{t("They cannot sign in or act. Their live contracts freeze and are flagged for review. Nothing is deleted.")}</p>
                        <div className="field">
                          <label htmlFor={`sus-${user.id}`}>{t("Reason")}</label>
                          <textarea id={`sus-${user.id}`} name="reason" required minLength={3} maxLength={500} />
                        </div>
                      </ConfirmForm>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">{t("No users match that search.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="small muted">{t("Password resets are done by the user from the sign-in page")}{clerkEnabled ? t(" (Clerk)") : ""}{t(". Users with financial history are suspended, never deleted.")}</p>
      </section>

      <section id="staff" className="card" aria-labelledby="st-h">
        <h2 id="st-h">{t("Add an arbitrator or auditor")}</h2>
        <p className="small muted">
          {clerkEnabled
            ? t("They get an email invitation. The role is set when they sign up. Turn on required two-step verification in the Clerk dashboard so they enrol on first sign-in.")
            : t("Demo mode: the account is created at once and appears on the sign-in picker.")}
        </p>
        <form action={createStaffAction} className="form-grid form-grid-180">
          <div className="field">
            <label htmlFor="staff-name">{t("Full name")}</label>
            <input type="text" id="staff-name" name="name" required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="staff-email">{t("Email")}</label>
            <input id="staff-email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="staff-role">{t("Role")}</label>
            <select id="staff-role" name="role" defaultValue="arbitrator">
              <option value="arbitrator">{t("Arbitrator")}</option>
              <option value="auditor">{t("Auditor")}</option>
            </select>
          </div>
          <div>
            <SubmitButton pendingLabel={t("Adding…")}>{t("Add account")}</SubmitButton>
          </div>
        </form>
      </section>

      <section id="settings" className="card" aria-labelledby="se-h">
        <h2 id="se-h">{t("Platform settings")}</h2>
        <p className="small muted">{t("Every change is checked, then written to the audit log with the old and new values. The fee applies to new contracts only. Existing contracts keep the fee they were created with.")}</p>
        <form action={updateSettingsAction} className="form-grid form-grid-210">
          <div className="field">
            <label htmlFor="s-fee">{t("Platform fee (%)")}</label>
            <input id="s-fee" name="feePercent" type="number" step="0.01" min={0} max={20} required defaultValue={s.feeBps / 100} />
          </div>
          <div className="field">
            <label htmlFor="s-review">{t("Default review period (days)")}</label>
            <input id="s-review" name="defaultReviewDays" type="number" min={1} max={14} required defaultValue={s.defaultReviewDays} />
          </div>
          <div className="field">
            <label htmlFor="s-rev">{t("Default revision limit")}</label>
            <input id="s-rev" name="defaultRevisionLimit" type="number" min={0} max={5} required defaultValue={s.defaultRevisionLimit} />
          </div>
          <div className="field">
            <label htmlFor="s-prop">{t("Proposal expires after (days)")}</label>
            <input id="s-prop" name="proposalDays" type="number" min={1} max={30} required defaultValue={s.proposalDays} />
          </div>
          <div className="field">
            <label htmlFor="s-fund">{t("Funding deadline (days)")}</label>
            <input id="s-fund" name="fundingDays" type="number" min={1} max={30} required defaultValue={s.fundingDays} />
          </div>
          <div className="field">
            <label htmlFor="s-evid">{t("Evidence window (days)")}</label>
            <input id="s-evid" name="evidenceDays" type="number" min={1} max={14} required defaultValue={s.evidenceDays} />
          </div>
          <div className="field">
            <label htmlFor="s-arb">{t("Arbitrator decision time (days)")}</label>
            <input id="s-arb" name="arbitrationDays" type="number" min={1} max={30} required defaultValue={s.arbitrationDays} />
          </div>
          <div className="field">
            <label htmlFor="s-min">{t("Smallest top-up (")}{unit})</label>
            <input type="text" id="s-min" name="topUpMinSC" required inputMode="decimal" defaultValue={formatSC(s.topUpMin, false)} />
          </div>
          <div className="field">
            <label htmlFor="s-max">{t("Largest top-up (")}{unit})</label>
            <input type="text" id="s-max" name="topUpMaxSC" required inputMode="decimal" defaultValue={formatSC(s.topUpMax, false)} />
          </div>
          <div className="field">
            <label htmlFor="s-day">{t("Daily top-up limit (")}{unit})</label>
            <input type="text" id="s-day" name="topUpDailyMaxSC" required inputMode="decimal" defaultValue={formatSC(s.topUpDailyMax, false)} />
          </div>
          <div className="u-span-all">
            <SubmitButton pendingLabel={t("Saving…")}>{t("Save settings")}</SubmitButton>
          </div>
        </form>
      </section>
    </Shell>
  );
}
