"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { currencyLabel, feeFor, formatSC, scToMinor } from "@/domain/money";
import { SubmitButton } from "./submit-button";

interface Row {
  id: number;
  title: string;
  due: string;
  amount: string;
}

const STEPS = ["Details", "Milestones", "Terms", "Review"] as const;

const parseSC = (text: string): number | null => {
  try {
    return text.trim() === "" ? null : scToMinor(text);
  } catch {
    return null;
  }
};

/** Four-step wizard (S5). Every field stays in the DOM so the one form still posts everything on the last step. */
export function NewContractForm({
  action,
  feeBps,
  currency,
  draftKey,
  defaultReviewDays = 3,
  defaultRevisionLimit = 2,
}: {
  action: (formData: FormData) => void | Promise<void>;
  feeBps: number;
  currency?: string;
  draftKey?: string;
  defaultReviewDays?: number;
  defaultRevisionLimit?: number;
}) {
  const money = (v: number) => formatSC(v, true, currency);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [reviewDays, setReviewDays] = useState(String(defaultReviewDays));
  const [revisions, setRevisions] = useState(String(defaultRevisionLimit));
  const [agreed, setAgreed] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ id: 1, title: "", due: "", amount: "" }]);
  const [nextId, setNextId] = useState(2);
  const [stepError, setStepError] = useState("");
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const [draftState, setDraftState] = useState<"none" | "restored" | "saved">("none");
  const draftReady = useRef(false);
  const storageKey = `trustlock:new-contract-draft:${draftKey ?? "anon"}`;

  // Draft: saved in this browser on every change, restored on the next visit, cleared when the proposal is sent (FR-3.x draft per step).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after hydration
        setTitle(String(d.title ?? ""));
        setDescription(String(d.description ?? ""));
        setEmail(String(d.email ?? ""));
        setReviewDays(String(d.reviewDays ?? defaultReviewDays));
        setRevisions(String(d.revisions ?? defaultRevisionLimit));
        if (Array.isArray(d.rows) && d.rows.length > 0) {
          setRows(d.rows as Row[]);
          setNextId(Number(d.nextId) || d.rows.length + 1);
        }
        setStep(Math.min(Math.max(Number(d.step) || 0, 0), 2));
        setDraftState("restored");
      }
    } catch {
      /* storage blocked or draft unreadable: start empty */
    }
    draftReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore runs once per draft key; the defaults only fill gaps
  }, [storageKey]);

  useEffect(() => {
    if (!draftReady.current) return;
    try {
      const empty = !title && !description && !email && rows.every((r) => !r.title && !r.due && !r.amount);
      if (empty) window.localStorage.removeItem(storageKey);
      else {
        window.localStorage.setItem(storageKey, JSON.stringify({ title, description, email, reviewDays, revisions, rows, nextId, step }));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the "saved" note after a write
        setDraftState((d) => (d === "restored" ? d : "saved"));
      }
    } catch {
      /* storage blocked: the draft just is not kept */
    }
  }, [title, description, email, reviewDays, revisions, rows, nextId, step, storageKey]);

  function discardDraft() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setTitle("");
    setDescription("");
    setEmail("");
    setReviewDays(String(defaultReviewDays));
    setRevisions(String(defaultRevisionLimit));
    setRows([{ id: 1, title: "", due: "", amount: "" }]);
    setNextId(2);
    setAgreed(false);
    setStep(0);
    setDraftState("none");
  }

  const { totalMinor, anyInvalid } = useMemo(() => {
    let total = 0;
    let invalid = false;
    for (const r of rows) {
      const m = parseSC(r.amount);
      if (m === null) invalid = invalid || r.amount.trim() !== "";
      else total += m;
    }
    return { totalMinor: total, anyInvalid: invalid };
  }, [rows]);

  const fee = feeFor(totalMinor, feeBps);
  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function stepIsValid(i: number): boolean {
    setStepError("");
    const fields = panels.current[i]?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? [];
    for (const f of fields) {
      if (!f.reportValidity()) return false;
    }
    if (i === 1) {
      if (anyInvalid) {
        setStepError("One amount is not a valid number. Use digits with up to 2 decimals, like 15000 or 2500.50.");
        return false;
      }
      if (totalMinor <= 0) {
        setStepError("Add an amount to at least one milestone. The contract total is the sum of the milestones.");
        return false;
      }
    }
    return true;
  }

  const go = (to: number) => {
    if (to > step && !stepIsValid(step)) return;
    setStepError("");
    setStep(to);
  };

  const last = step === STEPS.length - 1;

  return (
    <form
      action={action}
      className="wizard"
      noValidate
      onSubmit={(e) => {
        if (!last) {
          e.preventDefault();
          go(step + 1);
        } else {
          try {
            window.localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        }
      }}
    >
      <ol className="stepper" aria-label="Create contract steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <span className={`chip${i === step ? " on" : ""}`} aria-current={i === step ? "step" : undefined}>
              {i + 1} {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="small muted" aria-live="polite">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
        {draftState !== "none" && (
          <>
            {" · "}
            {draftState === "restored" ? "Your saved draft was restored." : "Draft saved on this device."}{" "}
            <button type="button" className="linklike" style={{ color: "var(--blue-700)", background: "none", border: 0, padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }} onClick={discardDraft}>
              Discard draft
            </button>
          </>
        )}
      </p>

      <div className="split">
        <div className="col-main">
          {/* Step 1 */}
          <section className="card" aria-labelledby="details-h" hidden={step !== 0} ref={(el) => { panels.current[0] = el as unknown as HTMLDivElement; }}>
            <h2 id="details-h">Details</h2>
            <div className="field">
              <label htmlFor="title">Contract title</label>
              <input id="title" name="title" type="text" required minLength={3} maxLength={120} autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="description">What needs to be done</label>
              <textarea id="description" name="description" required maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </section>

          {/* Step 2 */}
          <section className="card" aria-labelledby="ms-h" hidden={step !== 1} ref={(el) => { panels.current[1] = el as unknown as HTMLDivElement; }}>
            <h2 id="ms-h">Milestones</h2>
            {rows.map((r, i) => (
              <div className="ms-row" key={r.id}>
                <div className="field">
                  <label htmlFor={`mt-${r.id}`}>Deliverable {i + 1}</label>
                  <input id={`mt-${r.id}`} name="m_title" type="text" required maxLength={120} value={r.title} onChange={(e) => update(r.id, { title: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`md-${r.id}`}>Due date</label>
                  <input id={`md-${r.id}`} name="m_due" type="date" required value={r.due} onChange={(e) => update(r.id, { due: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`ma-${r.id}`}>Amount ({currencyLabel(currency)})</label>
                  <input id={`ma-${r.id}`} name="m_amount" type="text" inputMode="decimal" required value={r.amount} onChange={(e) => update(r.id, { amount: e.target.value })} />
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: 0 }}
                  aria-label={`Remove deliverable ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={rows.length >= 10}
                onClick={() => {
                  setRows((rs) => [...rs, { id: nextId, title: "", due: "", amount: "" }]);
                  setNextId((n) => n + 1);
                }}
              >
                Add milestone (up to 10)
              </button>
              <span className="notice" style={{ padding: "var(--space-2) var(--space-3)" }} aria-live="polite">
                Milestones add up to {money(totalMinor)}. That is the contract total.
              </span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="reviewPeriodDays">Review period (days)</label>
                <input id="reviewPeriodDays" name="reviewPeriodDays" type="number" min={1} max={14} required value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} />
                <span className="hint">If you do nothing, payment is released when this ends.</span>
              </div>
              <div className="field">
                <label htmlFor="revisionLimit">Revisions allowed</label>
                <input id="revisionLimit" name="revisionLimit" type="number" min={0} max={5} required value={revisions} onChange={(e) => setRevisions(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="freelancerEmail">Freelancer email</label>
                <input id="freelancerEmail" name="freelancerEmail" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
                <span className="hint">They need a TrustLock account as a freelancer.</span>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section className="card" aria-labelledby="terms-h" hidden={step !== 2} ref={(el) => { panels.current[2] = el as unknown as HTMLDivElement; }}>
            <h2 id="terms-h">Terms</h2>
            <div className="kv"><span>Contract total</span><strong className="mono">{money(totalMinor)}</strong></div>
            <div className="kv"><span>Review period</span><span>{reviewDays || "?"} days, then auto-approve</span></div>
            <div className="kv"><span>Revisions allowed</span><span>{revisions || "0"}</span></div>
            <div className="kv"><span>Platform fee</span><span>{feeBps / 100}% ({money(fee)}), taken at release</span></div>
            <p className="small muted">Terms lock once you fund escrow. Later changes need both parties to agree. The freelancer sees the fee before they accept.</p>
            <label className="check">
              <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I understand the terms lock when I fund the escrow.</span>
            </label>
          </section>

          {/* Step 4 */}
          <section className="card" aria-labelledby="review-h" hidden={step !== 3}>
            <h2 id="review-h">Review</h2>
            <div className="kv"><span>Title</span><strong>{title}</strong></div>
            <div className="kv"><span>Freelancer</span><span>{email}</span></div>
            <p className="small muted">{description}</p>
            <ul style={{ margin: 0, paddingLeft: "var(--space-6)" }}>
              {rows.map((r, i) => (
                <li key={r.id}>
                  {r.title || `Deliverable ${i + 1}`} · due {r.due || "?"} · <span className="mono">{parseSC(r.amount) === null ? "?" : money(parseSC(r.amount) as number)}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">
              Review period {reviewDays} days · {revisions} revisions · platform fee {feeBps / 100}%
            </p>
          </section>

          {stepError && (
            <p className="notice error" role="alert">
              {stepError}
            </p>
          )}
        </div>

        <aside className="col-side" aria-label="Cost preview">
          <div className="card">
            <h2>Cost preview</h2>
            <div className="kv"><span>Contract total</span><span className="mono">{money(totalMinor)}</span></div>
            <div className="kv"><span>Platform fee ({feeBps / 100}%)</span><span className="mono">{money(fee)}</span></div>
            <div className="kv total"><span>Freelancer receives</span><span className="mono">{money(totalMinor - fee)}</span></div>
            <p className="small muted">Terms lock once you fund escrow. Later changes need both of you to agree.</p>
            <input type="hidden" name="totalSC" value={(totalMinor / 100).toFixed(2)} />
            {last ? (
              <SubmitButton pendingLabel="Sending…">Send proposal</SubmitButton>
            ) : (
              <button type="submit" className="btn btn-primary">
                Continue to {STEPS[step + 1].toLowerCase()}
              </button>
            )}
            {step > 0 && (
              <button type="button" className="btn" onClick={() => go(step - 1)}>
                Back to {STEPS[step - 1].toLowerCase()}
              </button>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}
