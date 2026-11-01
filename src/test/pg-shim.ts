// Test-only stand-in for the supabase-js query builder, backed by a real Postgres connection.
// It supports just the calls SupabaseRepository makes. The SQL that runs is real; only the HTTP layer (PostgREST) is replaced.
import pg from "pg";

pg.types.setTypeParser(20, (v) => Number(v)); // bigint -> number, as PostgREST returns it
pg.types.setTypeParser(1184, (v) => {
  // timestamptz -> "2026-10-28T07:52:10.123456+00:00", PostgREST's format
  const d = new Date(v);
  return d.toISOString().replace("Z", "000+00:00");
});

type Result = { data: unknown; error: { message: string; code?: string } | null };
const q = (ident: string) => '"' + ident.replace(/"/g, '""') + '"';

class Query implements PromiseLike<Result> {
  private cols = "*";
  private where: string[] = [];
  private args: unknown[] = [];
  private orderBy: string[] = [];
  private lim = "";
  private single = false;
  private upsertRow: Record<string, unknown> | null = null;
  private conflict = "id";
  constructor(private pool: pg.Pool, private table: string) {}

  select(cols = "*") { this.cols = cols === "*" ? "*" : cols.split(",").map((c) => q(c.trim())).join(","); return this; }
  private add(sql: (n: number) => string, v: unknown) { this.args.push(v); this.where.push(sql(this.args.length)); return this; }
  eq(c: string, v: unknown) { return this.add((n) => `${q(c)} = $${n}`, v); }
  in(c: string, v: unknown[]) { return this.add((n) => `${q(c)} = any($${n})`, v); }
  like(c: string, v: string) { return this.add((n) => `${q(c)} like $${n}`, v); }
  gte(c: string, v: unknown) { return this.add((n) => `${q(c)} >= $${n}`, v); }
  order(c: string, o?: { ascending?: boolean }) { this.orderBy.push(`${q(c)} ${o?.ascending === false ? "desc" : "asc"}`); return this; }
  range(a: number, b: number) { this.lim = ` limit ${b - a + 1} offset ${a}`; return this; }
  maybeSingle() { this.single = true; return this; }
  upsert(row: Record<string, unknown>, opts: { onConflict: string }) { this.upsertRow = row; this.conflict = opts.onConflict; return this; }

  then<R1 = Result, R2 = never>(ok?: ((v: Result) => R1 | PromiseLike<R1>) | null, bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
    return this.run().then(ok, bad);
  }
  private async run(): Promise<Result> {
    try {
      if (this.upsertRow) {
        const keys = Object.keys(this.upsertRow);
        const sql = `insert into public.${q(this.table)} (${keys.map(q).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})
          on conflict (${q(this.conflict)}) do update set ${keys.filter((k) => k !== this.conflict).map((k) => `${q(k)} = excluded.${q(k)}`).join(",")}`;
        await this.pool.query(sql, keys.map((k) => this.upsertRow![k]));
        return { data: null, error: null };
      }
      const sql = `select ${this.cols} from public.${q(this.table)}${this.where.length ? " where " + this.where.join(" and ") : ""}${this.orderBy.length ? " order by " + this.orderBy.join(",") : ""}${this.lim}`;
      const { rows } = await this.pool.query(sql, this.args);
      if (this.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { data: null, error: { message: err.message, code: err.code } };
    }
  }
}

export function pgClient(pool: pg.Pool) {
  return {
    from: (table: string) => new Query(pool, table),
    rpc: async (fn: string, args: Record<string, unknown>): Promise<Result> => {
      try {
        const { rows } = await pool.query(`select public.${q(fn)}($1::jsonb) as r`, [JSON.stringify(args.req)]);
        return { data: rows[0].r, error: null };
      } catch (e) {
        const err = e as { message: string; code?: string };
        return { data: null, error: { message: err.message, code: err.code } };
      }
    },
  };
}
