import { Shell } from "@/components/shell";
import { fmtDateTime } from "@/components/format";
import { Notices } from "@/components/ui";
import { requireViewer } from "@/server/auth";
import { overviewFor } from "@/server/developer-portal";
import { getPlatformRepo } from "@/server/platform";
import { getT } from "@/i18n/server";
import { addEndpointAction, createKeyAction, removeEndpointAction, revokeKeyAction, testEndpointAction } from "./actions";
import { AddEndpointForm, CreateKeyForm } from "./forms";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Developers") };
}

export default async function Developers({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const t = await getT();
  const viewer = await requireViewer(["client", "freelancer"]);
  const sp = await searchParams;
  const { keys, endpoints, calls } = await overviewFor(await getPlatformRepo(), viewer.id);
  const modeLabel = (m: "test" | "live") => (m === "live" ? t("Live") : t("Test"));

  return (
    <Shell viewer={viewer} active="/developers">
      <div>
        <h1>{t("Developers")}</h1>
        <p className="muted">{t("Let your own app use TrustLock escrow for its users. Your server calls the API with a key; you never share your users' passwords or emails.")}</p>
      </div>
      <Notices error={sp.error} ok={sp.ok} />

      <section className="card" aria-labelledby="start-h">
        <h2 id="start-h">{t("Start here")}</h2>
        <p className="small muted">{t("Keep keys on your server only. Test keys work in their own separate set of users and contracts, so trying things out never touches your live data.")}</p>
        <p className="hash">{`curl -H "Authorization: Bearer tlk_..." -H "TrustLock-User: your-user-id" /api/v1/wallet`}</p>
        <p className="small">
          <a href="/api/v1/openapi.json">{t("API description (OpenAPI)")}</a>
        </p>
      </section>

      <section className="u-flex u-col u-gap-3" aria-labelledby="keys-h">
        <h2 id="keys-h">{t("API keys")}</h2>
        {keys.length === 0 ? (
          <div className="card"><p>{t("No keys yet.")}</p></div>
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Name")}</th>
                  <th>{t("Key starts with")}</th>
                  <th>{t("Environment")}</th>
                  <th>{t("Made")}</th>
                  <th>{t("Status")}</th>
                  <th><span className="sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    <td className="mono">{k.prefix}…</td>
                    <td>{modeLabel(k.mode)}</td>
                    <td>{fmtDateTime(k.createdAt, t)}</td>
                    <td>{k.revokedAt ? t("Revoked") : t("Active")}</td>
                    <td>
                      {!k.revokedAt && (
                        <form action={revokeKeyAction}>
                          <input type="hidden" name="id" value={k.id} />
                          <button className="btn" type="submit">{t("Revoke")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CreateKeyForm action={createKeyAction} />
      </section>

      <section className="u-flex u-col u-gap-3" aria-labelledby="hooks-h">
        <h2 id="hooks-h">{t("Webhooks")}</h2>
        <p className="small muted">{t("TrustLock sends a signed message to your server when a contract changes, such as funded, delivered or completed, so you do not have to keep asking.")}</p>
        {endpoints.length > 0 && (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Address")}</th>
                  <th>{t("Environment")}</th>
                  <th>{t("Made")}</th>
                  <th><span className="sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.url}</td>
                    <td>{modeLabel(e.mode)}</td>
                    <td>{fmtDateTime(e.createdAt, t)}</td>
                    <td>
                      <div className="btn-row">
                        <form action={testEndpointAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="btn" type="submit">{t("Send test event")}</button>
                        </form>
                        <form action={removeEndpointAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="btn" type="submit">{t("Remove")}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddEndpointForm action={addEndpointAction} />
      </section>

      <section className="u-flex u-col u-gap-3" aria-labelledby="calls-h">
        <h2 id="calls-h">{t("Recent API calls")}</h2>
        {calls.length === 0 ? (
          <div className="card"><p>{t("No calls yet. They appear here once your server uses a key.")}</p></div>
        ) : (
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("When")}</th>
                  <th>{t("Environment")}</th>
                  <th>{t("Call")}</th>
                  <th>{t("Result")}</th>
                  <th>{t("Time")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDateTime(c.at, t)}</td>
                    <td>{modeLabel(c.mode)}</td>
                    <td className="mono">{c.method} {c.path}</td>
                    <td>{c.code ? `${c.status} ${c.code}` : c.status}</td>
                    <td>{c.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
