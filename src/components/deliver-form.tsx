"use client";

import { useState } from "react";
import { SubmitButton } from "./submit-button";

const ALLOWED = "zip, pdf, png, jpg, docx, txt";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Computes the file's SHA-256 fingerprint in the browser, so it can be shown before delivery (FR-5.2). */
export function DeliverForm({ action, contractId, reviewDays }: { action: (formData: FormData) => void | Promise<void>; contractId: string; reviewDays: number }) {
  const [file, setFile] = useState<{ name: string; size: number; hash: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form action={action} className="card u-gap-4">
      <h2>Deliver your work</h2>
      <input type="hidden" name="id" value={contractId} />
      <div className="field">
        <label htmlFor="file">Choose a file</label>
        <input
          id="file"
          type="file"
          required
          accept=".zip,.pdf,.png,.jpg,.jpeg,.docx,.txt"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return setFile(null);
            setBusy(true);
            try {
              setFile({ name: f.name, size: f.size, hash: await sha256Hex(f) });
            } finally {
              setBusy(false);
            }
          }}
        />
        <span className="hint">Allowed: {ALLOWED}. Up to 25 MB.</span>
      </div>
      {busy && <p className="small muted" role="status">Calculating the file fingerprint…</p>}
      {file && (
        <div>
          <p className="small muted">SHA-256 fingerprint, calculated on your device</p>
          <p className="hash">{file.hash}</p>
          <input type="hidden" name="fileName" value={file.name} />
          <input type="hidden" name="sizeBytes" value={file.size} />
          <input type="hidden" name="sha256" value={file.hash} />
        </div>
      )}
      <div className="field">
        <label htmlFor="note">Note to client (optional)</label>
        <textarea id="note" name="note" maxLength={500} />
      </div>
      <p className="small muted">
        The contract moves to Delivered. The client gets {reviewDays} {reviewDays === 1 ? "day" : "days"} to approve, ask for changes, or let it auto-approve.
      </p>
      <div>
        <SubmitButton pendingLabel="Delivering…">Submit delivery</SubmitButton>
      </div>
    </form>
  );
}
