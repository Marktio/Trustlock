import { fmtDateTime } from "@/components/format";
import { currencyLabel, formatSC } from "@/domain/money";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";

const csv = (v: string) => (/[",\n]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the viewer's own wallet history. Text cells starting with = + - @ are quoted so spreadsheets do not run them as formulas. */
export async function GET() {
  const viewer = await requireViewer(["client", "freelancer"]);
  const { svc } = await getContainer();
  const { entries } = await svc.getWallet(toActor(viewer));
  const rows = entries
    .filter((e) => e.account.endsWith(":available"))
    .map((e) => [fmtDateTime(e.createdAt), e.memo || "Transaction", e.delta >= 0 ? "credit" : "debit", `${e.delta < 0 ? "-" : ""}${formatSC(Math.abs(e.delta), false).replace(/,/g, "")}`]);
  const body = [["Date (UTC)", "Description", "Direction", `Amount (${currencyLabel(viewer.currency)})`], ...rows].map((r) => [csv(r[0]), csv(r[1]), r[2], r[3]].join(",")).join("\n");
  return new Response(body + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="trustlock-wallet.csv"' },
  });
}
