import { db } from '../../../../db';
import { folders, savedRequests, requestExamples } from '../../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { cache, CacheKeys } from '../../../../utils/cache';
import { trackResourceAction } from '../../../../services/usageTracking';

async function getSiblingFolders(collectionId: string, parentFolderId: string | null) {
  return db
    .select()
    .from(folders)
    .where(
      parentFolderId
        ? and(
            eq(folders.collectionId, collectionId),
            eq(folders.parentFolderId, parentFolderId)
          )
        : and(
            eq(folders.collectionId, collectionId),
            isNull(folders.parentFolderId)
          )
    );
}

async function generateUniqueFolderName(
  collectionId: string,
  parentFolderId: string | null,
  baseName: string
): Promise<string> {
  const siblings = await getSiblingFolders(collectionId, parentFolderId);
  const siblingNames = new Set(siblings.map((folder) => folder.name.toLowerCase()));

  let candidate = `${baseName} (Copy)`;
  let counter = 1;

  while (siblingNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (Copy) (${counter})`;
    counter++;
  }

  return candidate;
}

async function copyRequests(sourceFolderId: string, targetFolderId: string, userId?: string, userEmail?: string) {
  const requests = await db
    .select()
    .from(savedRequests)
    .where(eq(savedRequests.folderId, sourceFolderId))
    .orderBy(savedRequests.order);

  for (const request of requests) {
    const [newRequest] = await db
      .insert(savedRequests)
      .values({
        folderId: targetFolderId,
        name: request.name,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
        auth: request.auth,
        inheritAuth: request.inheritAuth,
        mockConfig: request.mockConfig,
        preScript: request.preScript,
        postScript: request.postScript,
        pathVariables: request.pathVariables,
        paramNotes: request.paramNotes,
        notes: request.notes,
        paramSchema: request.paramSchema,
        queryParams: request.queryParams,
        curlExample: request.curlExample,
        order: request.order
      })
      .returning();

    const examples = await db
      .select()
      .from(requestExamples)
      .where(eq(requestExamples.requestId, request.id));

    for (const example of examples) {
      await db.insert(requestExamples).values({
        requestId: newRequest.id,
        name: example.name,
        statusCode: example.statusCode,
        headers: example.headers,
        body: example.body,
        requestQueryParams: example.requestQueryParams,
        requestBody: example.requestBody,
        isDefault: example.isDefault
      });
    }

    if (userId) {
      trackResourceAction({
        userId,
        userEmail,
        workspaceId: 'personal',
        action: 'create',
        resourceType: 'request',
        resourceId: newRequest.id,
        resourceName: newRequest.name
      });
    }
  }

  return requests.length;
}

async function duplicateFolderTree(
  sourceFolderId: string,
  targetParentFolderId: string | null,
  collectionId: string,
  allCollectionFolders: typeof folders.$inferSelect[],
  userId?: string,
  userEmail?: string
): Promise<{ folder: typeof folders.$inferSelect; requestCount: number; folderCount: number }> {
  const sourceFolder = allCollectionFolders.find((folder) => folder.id === sourceFolderId);

  if (!sourceFolder) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Folder not found'
    });
  }

  const siblings = await getSiblingFolders(collectionId, targetParentFolderId);
  const maxOrder = siblings.reduce((max, folder) => Math.max(max, folder.order), -1);
  const folderName = targetParentFolderId === sourceFolder.parentFolderId
    ? await generateUniqueFolderName(collectionId, targetParentFolderId, sourceFolder.name)
    : sourceFolder.name;

  const [newFolder] = await db
    .insert(folders)
    .values({
      collectionId,
      parentFolderId: targetParentFolderId,
      name: folderName,
      order: maxOrder + 1
    })
    .returning();

  let requestCount = await copyRequests(sourceFolderId, newFolder.id, userId, userEmail);
  let folderCount = 1;

  const childFolders = allCollectionFolders
    .filter((folder) => folder.parentFolderId === sourceFolderId)
    .sort((a, b) => a.order - b.order);

  for (const childFolder of childFolders) {
    const duplicatedChild = await duplicateFolderTree(
      childFolder.id,
      newFolder.id,
      collectionId,
      allCollectionFolders,
      userId,
      userEmail
    );
    requestCount += duplicatedChild.requestCount;
    folderCount += duplicatedChild.folderCount;
  }

  return { folder: newFolder, requestCount, folderCount };
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Folder ID is required'
    });
  }

  try {
    const existing = (await db
      .select()
      .from(folders)
      .where(eq(folders.id, id))
      .limit(1))[0];

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Folder not found'
      });
    }

    const allCollectionFolders = await db
      .select()
      .from(folders)
      .where(eq(folders.collectionId, existing.collectionId));

    const user = event.context.user;
    const result = await duplicateFolderTree(
      id,
      existing.parentFolderId,
      existing.collectionId,
      allCollectionFolders,
      user?.id,
      user?.email
    );

    if (user?.id) {
      trackResourceAction({
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId || 'personal',
        action: 'create',
        resourceType: 'folder',
        resourceId: result.folder.id,
        resourceName: result.folder.name
      });

      cache.delete(CacheKeys.workspaceTree(user.id));
    }

    return {
      folder: result.folder,
      requestCount: result.requestCount,
      folderCount: result.folderCount
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    console.error('Error duplicating folder:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to duplicate folder'
    });
  }
});
