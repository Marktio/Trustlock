"use client";

import { useState } from "react";
import { SubmitButton } from "./submit-button";

interface Picked {
  name: string;
  sizeBytes: number;
  sha256: string;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Text and up to the remaining number of files. Each file's SHA-256 fingerprint is calculated in the browser (FR-6.3). */
export function EvidenceForm({ action, contractId, filesLeft }: { action: (formData: FormData) => void | Promise<void>; contractId: string; filesLeft: number }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form action={action} className="field u-gap-3">
      <input type="hidden" name="id" value={contractId} />
      <input type="hidden" name="files" value={JSON.stringify(picked)} />
      <label htmlFor="ev-text">What would you like the arbitrator to know?</label>
      <textarea id="ev-text" name="text" maxLength={1000} />
      {filesLeft > 0 && (
        <>
          <label htmlFor="ev-files">Attach files (optional, {filesLeft} left)</label>
          <input
            id="ev-files"
            type="file"
            multiple
            accept=".zip,.pdf,.png,.jpg,.jpeg,.docx,.txt"
            onChange={async (e) => {
              const list = Array.from(e.target.files ?? []);
              setError("");
              if (list.length > filesLeft) {
                setError(`You can attach ${filesLeft} more ${filesLeft === 1 ? "file" : "files"}.`);
                e.target.value = "";
                return setPicked([]);
              }
              setBusy(true);
              try {
                setPicked(await Promise.all(list.map(async (f) => ({ name: f.name, sizeBytes: f.size, sha256: await sha256Hex(f) }))));
              } finally {
                setBusy(false);
              }
            }}
          />
          <span className="hint">Allowed: zip, pdf, png, jpg, docx, txt. Up to 25 MB each. Files are recorded by their fingerprint.</span>
        </>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      {busy && <p className="small muted" role="status">Calculating fingerprints…</p>}
      {picked.length > 0 && (
        <ul className="small u-m0 u-pl6">
          {picked.map((p) => (
            <li key={p.name}>
              {p.name} <span className="mono muted">{p.sha256.slice(0, 12)}…</span>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Once submitted, evidence cannot be edited or deleted.</p>
      <div>
        <SubmitButton pendingLabel="Submitting…">Submit evidence</SubmitButton>
      </div>
    </form>
  );
}
