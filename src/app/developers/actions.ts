"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getContainer } from "@/server/container";
import { PortalError, addEndpointFor, createKeyFor, ownEndpointFor, removeEndpointFor, revokeKeyFor } from "@/server/developer-portal";
import { getPlatformRepo } from "@/server/platform";
import { sendTestEvent } from "@/server/webhooks";
import { getT } from "@/i18n/server";

export interface CreatedSecret {
  /** Shown once. It is not stored anywhere we can read it back. */
  secret?: string;
  label?: string;
  error?: string;
}

const field = (f: FormData, name: string) => String(f.get(name) ?? "");

async function owned<T>(run: (ownerId: string) => Promise<T>, t: Awaited<ReturnType<typeof getT>>): Promise<{ value?: T; error?: string }> {
  const viewer = await requireViewer(["client", "freelancer"]);
  try {
    return { value: await run(viewer.id) };
  } catch (e) {
    if (e instanceof PortalError) return { error: t(e.message) };
    throw e;
  }
}

export async function createKeyAction(_prev: CreatedSecret, formData: FormData): Promise<CreatedSecret> {
  const t = await getT();
  const mode = field(formData, "mode") === "live" ? "live" : "test";
  const out = await owned(async (id) => createKeyFor(await getPlatformRepo(), id, field(formData, "label"), mode), t);
  if (out.error) return { error: out.error };
  revalidatePath("/developers");
  return { secret: out.value!.secret, label: out.value!.record.label };
}

export async function addEndpointAction(_prev: CreatedSecret, formData: FormData): Promise<CreatedSecret> {
  const t = await getT();
  const mode = field(formData, "mode") === "live" ? "live" : "test";
  const out = await owned(async (id) => addEndpointFor(await getPlatformRepo(), id, field(formData, "url"), mode), t);
  if (out.error) return { error: out.error };
  revalidatePath("/developers");
  return { secret: out.value!.secret, label: out.value!.url };
}

function back(kind: "ok" | "error", message: string): never {
  redirect(`/developers?${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

export async function revokeKeyAction(formData: FormData) {
  const t = await getT();
  const out = await owned(async (id) => revokeKeyFor(await getPlatformRepo(), id, field(formData, "id")), t);
  revalidatePath("/developers");
  back(out.error ? "error" : "ok", out.error ?? t("Key revoked. Calls made with it now fail."));
}

export async function removeEndpointAction(formData: FormData) {
  const t = await getT();
  const out = await owned(async (id) => removeEndpointFor(await getPlatformRepo(), id, field(formData, "id")), t);
  revalidatePath("/developers");
  back(out.error ? "error" : "ok", out.error ?? t("Webhook endpoint removed."));
}

export async function testEndpointAction(formData: FormData) {
  const t = await getT();
  const out = await owned(async (ownerId) => {
    const platforms = await getPlatformRepo();
    const endpoint = await ownEndpointFor(platforms, ownerId, field(formData, "id"));
    return sendTestEvent({ repo: (await getContainer()).repo, platforms }, endpoint);
  }, t);
  revalidatePath("/developers");
  if (out.error) back("error", out.error);
  const d = out.value!;
  if (d.status === "delivered") back("ok", t("Test event delivered. Your server answered {code}.", { code: String(d.lastStatus ?? "") }));
  back("error", t("Test event not delivered: {reason}", { reason: d.lastError ?? "" }));
}
