import { eq } from 'drizzle-orm';
import { db } from '../db';
import { workspaceShareEnvironments } from '../db/schema';

export async function getShareAllowedEnvironmentIds(shareId: string): Promise<string[]> {
  const rows = await db
    .select({ environmentId: workspaceShareEnvironments.environmentId })
    .from(workspaceShareEnvironments)
    .where(eq(workspaceShareEnvironments.shareId, shareId));

  return rows.map((row) => row.environmentId);
}
