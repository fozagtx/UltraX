import { sql } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = getDb();
  const collectorOk = await db
    .execute<{ updated_at: string }>(
      sql`select max(updated_at) as updated_at from collector_state`,
    )
    .then((r) => {
      const ts = r.rows[0]?.updated_at;
      return ts ? Date.now() - new Date(ts).getTime() < 20 * 60_000 : false;
    })
    .catch(() => false);

  return <AppShell collectorOk={collectorOk}>{children}</AppShell>;
}
