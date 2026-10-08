/**
 * Collection Variables Scope
 *
 * Postman collection variables are imported as an environment named
 * "<Collection> Variables" in the same project (see
 * server/api/definitions/import/postman.post.ts). Postman resolves {{var}}
 * and pm.variables.* against collection variables even when a different
 * environment is active — this resolves that environment for a saved
 * request so the same scope can participate in substitution.
 */

import { db } from '../db';
import { savedRequests, folders, collections, environments, environmentVariables } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface CollectionVariablesScope {
  /** Environment id backing the collection variables (writes from pm.collectionVariables land here) */
  environmentId: string;
  vars: Record<string, string>;
}

export const collectionVariablesEnvName = (collectionName: string): string =>
  `${collectionName} Variables`;

/**
 * Find the collection-variables environment for a saved request.
 * Returns null when the request is unsaved, has no collection, or the
 * collection has no imported variables environment.
 */
export async function findCollectionVariablesScope(
  requestId?: string | null
): Promise<CollectionVariablesScope | null> {
  if (!requestId) return null;

  const request = (await db
    .select({ collectionId: savedRequests.collectionId, folderId: savedRequests.folderId })
    .from(savedRequests)
    .where(eq(savedRequests.id, requestId))
    .limit(1))[0];
  if (!request) return null;

  let collectionId = request.collectionId;
  if (!collectionId && request.folderId) {
    const folder = (await db
      .select({ collectionId: folders.collectionId })
      .from(folders)
      .where(eq(folders.id, request.folderId))
      .limit(1))[0];
    collectionId = folder?.collectionId ?? null;
  }
  if (!collectionId) return null;

  const collection = (await db
    .select({ name: collections.name, projectId: collections.projectId })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1))[0];
  if (!collection) return null;

  const env = (await db
    .select({ id: environments.id })
    .from(environments)
    .where(
      and(
        eq(environments.projectId, collection.projectId),
        eq(environments.name, collectionVariablesEnvName(collection.name))
      )
    )
    .limit(1))[0];
  if (!env) return null;

  const rows = await db
    .select()
    .from(environmentVariables)
    .where(eq(environmentVariables.environmentId, env.id));

  return {
    environmentId: env.id,
    vars: rows.reduce((acc, v) => {
      acc[v.key] = v.value;
      return acc;
    }, {} as Record<string, string>)
  };
}
