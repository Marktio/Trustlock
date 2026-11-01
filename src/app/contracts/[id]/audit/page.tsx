import { notFound } from "next/navigation";
import Link from "next/link";
import { ACTION_LABEL, fmtDateTime } from "@/components/format";
import { Shell } from "@/components/shell";
import { DomainError } from "@/domain/errors";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Contract audit trail" };

/** The audit entries behind one contract's timeline. Only the two parties can open it; anyone else gets a 404. */
export default async function ContractAudit({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer(["client", "freelancer"]);
  const { id } = await params;
  const { svc } = await getContainer();
  let view;
  try {
    view = await svc.getContractView(toActor(viewer), id);
  } catch (e) {
    if (e instanceof DomainError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const { contract: c, client, freelancer, timeline, messages } = view;
  const nameOf = (actorId: string | null) => (actorId === client.id ? client.name : actorId === freelancer.id ? freelancer.name : "System");
  const rows = [...timeline, ...messages].sort((a, b) => a.seq - b.seq);

  return (
    <Shell viewer={viewer} active="/contracts">
      <div>
        <p className="crumb">
          <Link href="/contracts">Contracts</Link> / <Link href={`/contracts/${c.id}`}>{c.ref}</Link> / Audit trail
        </p>
        <h1>Audit trail</h1>
        <p className="muted">Every entry holds the fingerprint of the one before it, so a change anywhere would break the chain.</p>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Time (UTC)</th>
              <th scope="col">Who</th>
              <th scope="col">What</th>
              <th scope="col">Fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.seq} id={`audit-${e.seq}`}>
                <td className="num">{e.seq}</td>
                <td>{fmtDateTime(e.at)}</td>
                <td>{nameOf(e.actorId)}</td>
                <td>{e.action === "message.sent" ? "Message sent" : (ACTION_LABEL[e.action] ?? e.action)}</td>
                <td className="mono">{e.hash.slice(0, 6)}..{e.hash.slice(-4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
