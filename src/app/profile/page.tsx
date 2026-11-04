import { Shell } from "@/components/shell";
import { requireViewer } from "@/server/auth";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Profile and security" };

export default async function Profile() {
  const viewer = await requireViewer(["client", "freelancer"]);
  return (
    <Shell viewer={viewer} active="/profile">
      <div>
        <h1>Profile and security</h1>
        <p className="muted">Your account details. Roles can only be changed by an administrator.</p>
      </div>
      <section className="card" aria-labelledby="acct-h">
        <h2 id="acct-h">Account</h2>
        <div className="kv"><span>Name</span><strong>{viewer.name}</strong></div>
        <div className="kv"><span>Email</span><span>{viewer.email}</span></div>
        <div className="kv"><span>Role</span><span className="u-cap">{viewer.role}</span></div>
      </section>
      <section className="card" aria-labelledby="sec-h">
        <h2 id="sec-h">Security</h2>
        <p className="muted">
          {clerkEnabled
            ? "Password, two-step verification and active sessions are managed from the account menu in the sidebar."
            : "Demo mode: sign-in is a ready-made account, so there is no password to manage. With Clerk keys set, password and two-step verification appear here."}
        </p>
      </section>
    </Shell>
  );
}
