"use client";

import { useState } from "react";
import { currencyLabel } from "@/domain/money";
import { SubmitButton } from "./submit-button";

interface Row {
  id: number;
  title: string;
  due: string;
  amount: string;
}

/** Pre-filled with the current terms. The freelancer changes what they want and explains why (FR-3.3). */
export function CounterForm({
  action,
  contractId,
  currency,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  contractId: string;
  currency?: string;
  initial: { total: string; reviewPeriodDays: number; revisionLimit: number; milestones: { title: string; dueDate: string; amount: string }[] };
}) {
  const [rows, setRows] = useState<Row[]>(initial.milestones.map((m, i) => ({ id: i + 1, title: m.title, due: m.dueDate, amount: m.amount })));
  const [nextId, setNextId] = useState(initial.milestones.length + 1);
  const unit = currencyLabel(currency);
  const set = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="field" style={{ marginTop: "var(--space-3)", gap: "var(--space-3)" }}>
      <input type="hidden" name="id" value={contractId} />
      <div className="field">
        <label htmlFor="ct-total">Total ({unit})</label>
        <input type="text" id="ct-total" name="totalSC" required inputMode="decimal" defaultValue={initial.total} />
      </div>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <legend className="small" style={{ fontWeight: 600 }}>Milestones (must add up to the total)</legend>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 9rem 7rem auto", gap: "var(--space-2)", alignItems: "end" }}>
            <div className="field">
              <label htmlFor={`ct-t-${r.id}`}>Milestone {i + 1}</label>
              <input type="text" id={`ct-t-${r.id}`} name="m_title" required maxLength={120} value={r.title} onChange={(e) => set(r.id, { title: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`ct-d-${r.id}`}>Due</label>
              <input id={`ct-d-${r.id}`} name="m_due" type="date" required value={r.due} onChange={(e) => set(r.id, { due: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`ct-a-${r.id}`}>{unit}</label>
              <input type="text" id={`ct-a-${r.id}`} name="m_amount" required inputMode="decimal" value={r.amount} onChange={(e) => set(r.id, { amount: e.target.value })} />
            </div>
            <button type="button" className="btn" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Remove milestone ${i + 1}`}>
              Remove
            </button>
          </div>
        ))}
        {rows.length < 10 && (
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setRows((rs) => [...rs, { id: nextId, title: "", due: "", amount: "" }]);
                setNextId((n) => n + 1);
              }}
            >
              Add milestone
            </button>
          </div>
        )}
      </fieldset>
      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div className="field">
          <label htmlFor="ct-review">Review period (days)</label>
          <input id="ct-review" name="reviewPeriodDays" type="number" min={1} max={14} required defaultValue={initial.reviewPeriodDays} />
        </div>
        <div className="field">
          <label htmlFor="ct-rev">Revisions</label>
          <input id="ct-rev" name="revisionLimit" type="number" min={0} max={5} required defaultValue={initial.revisionLimit} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ct-note">Why are you changing the terms?</label>
        <textarea id="ct-note" name="note" required minLength={3} maxLength={500} />
      </div>
      <div>
        <SubmitButton pendingLabel="Sending…">Send counter-proposal</SubmitButton>
      </div>
    </form>
  );
}
