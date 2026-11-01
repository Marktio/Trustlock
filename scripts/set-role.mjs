// Gives a signed-up person a staff role (admin, arbitrator, auditor) through Clerk's API.
// Usage: node --env-file=.env.local scripts/set-role.mjs someone@example.com admin
// They must have signed up once first. Safe to repeat.
const ROLES = ["client", "freelancer", "arbitrator", "admin", "auditor"];
const [email, role] = process.argv.slice(2);
const key = process.env.CLERK_SECRET_KEY;
const base = process.env.CLERK_API_URL || "https://api.clerk.com";

if (!email || !ROLES.includes(role)) {
  console.error(`Usage: node --env-file=.env.local scripts/set-role.mjs <email> <${ROLES.join("|")}>`);
  process.exit(1);
}
if (!key) {
  console.error("CLERK_SECRET_KEY is not set. Run setup-real.bat first.");
  process.exit(1);
}

const call = async (path, init = {}) => {
  const res = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Clerk said ${res.status}: ${await res.text()}`);
  return res.json();
};

const users = await call(`/v1/users?email_address=${encodeURIComponent(email)}`);
if (!Array.isArray(users) || users.length === 0) {
  console.error(`No Clerk user with email ${email}. Ask them to sign up first, then run this again.`);
  process.exit(1);
}
const user = users[0];
await call(`/v1/users/${user.id}/metadata`, { method: "PATCH", body: JSON.stringify({ public_metadata: { role } }) });
console.log(`Done: ${email} is now "${role}". They may need to refresh the page.`);
