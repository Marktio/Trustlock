import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions";
import { Shell } from "@/components/shell";
import { fmtDateTime } from "@/components/format";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Notifications" };

/** Every change to one of your contracts that involves you, built from the audit log (FR-7.1). */
export default async function Notifications() {
  const viewer = await requireViewer(["client", "freelancer", "arbitrator"]);
  const { svc } = await getContainer();
  const { items, unread } = await svc.listNotifications(toActor(viewer));

  return (
    <Shell viewer={viewer} active="/notifications">
      <div>
        <h1>Notifications</h1>
        <p className="muted">
          What happened on your contracts. Important events are also sent by email; in this simulation the emails are captured, not delivered.
        </p>
      </div>
      {unread > 0 && (
        <form action={markNotificationsReadAction}>
          <button type="submit" className="btn">
            Mark all {unread} as read
          </button>
        </form>
      )}
      {items.length === 0 ? (
        <div className="card">
          <p>Nothing yet. Updates about your contracts will show here.</p>
        </div>
      ) : (
        <ul className="u-nolist u-m0 u-p0 u-flex u-col u-gap-3">
          {items.map((n) => (
            <li key={n.id} className={`card note-item${n.unread ? " unread" : ""}`}>
              <strong>
                {n.title}
                {n.unread && <span className="sr-only"> (unread)</span>}
              </strong>
              <span>{n.body}</span>
              <span className="small muted">
                {fmtDateTime(n.at)}
                {n.emailed ? " · emailed" : ""}
              </span>
              {n.contractId && (
                <div>
                  <Link className="btn" href={`/contracts/${n.contractId}`}>
                    Open contract
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
