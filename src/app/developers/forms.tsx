"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/i18n/client";
import type { CreatedSecret } from "./actions";

type Action = (prev: CreatedSecret, formData: FormData) => Promise<CreatedSecret>;
const none: CreatedSecret = {};

function Reveal({ state, what }: { state: CreatedSecret; what: "key" | "secret" }) {
  const t = useT();
  if (state.error) return <p className="notice error" role="alert">{state.error}</p>;
  if (!state.secret) return null;
  return (
    <div className="notice ok" role="status">
      <p>{what === "key" ? t("Copy your key now. It cannot be shown again, and TrustLock keeps only a hash of it.") : t("Copy the signing secret now. It cannot be shown again.")}</p>
      <p className="hash">{state.secret}</p>
    </div>
  );
}

export function CreateKeyForm({ action }: { action: Action }) {
  const t = useT();
  const [state, run] = useActionState(action, none);
  return (
    <form action={run} className="card u-gap-4">
      <h3>{t("Make a key")}</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="key-label">{t("Name")}</label>
          <input id="key-label" name="label" required maxLength={80} placeholder={t("For example: Acme production")} />
        </div>
        <div className="field">
          <label htmlFor="key-mode">{t("Environment")}</label>
          <select id="key-mode" name="mode" defaultValue="test">
            <option value="test">{t("Test (its own separate data)")}</option>
            <option value="live">{t("Live")}</option>
          </select>
        </div>
      </div>
      <Reveal state={state} what="key" />
      <div className="btn-row">
        <SubmitButton pendingLabel={t("Making…")}>{t("Make key")}</SubmitButton>
      </div>
    </form>
  );
}

export function AddEndpointForm({ action }: { action: Action }) {
  const t = useT();
  const [state, run] = useActionState(action, none);
  return (
    <form action={run} className="card u-gap-4">
      <h3>{t("Add a webhook endpoint")}</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="hook-url">{t("Address (https)")}</label>
          <input id="hook-url" name="url" type="url" required maxLength={500} placeholder="https://example.com/trustlock-webhook" />
        </div>
        <div className="field">
          <label htmlFor="hook-mode">{t("Environment")}</label>
          <select id="hook-mode" name="mode" defaultValue="test">
            <option value="test">{t("Test (its own separate data)")}</option>
            <option value="live">{t("Live")}</option>
          </select>
        </div>
      </div>
      <Reveal state={state} what="secret" />
      <div className="btn-row">
        <SubmitButton pendingLabel={t("Adding…")}>{t("Add endpoint")}</SubmitButton>
      </div>
    </form>
  );
}
