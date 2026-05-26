import { db } from '../../db';
import { collections, savedRequests, folders } from '../../db/schema';
import { eq, sql, and, or, inArray } from 'drizzle-orm';

interface PublicCollection {
  id: string;
  name: string;
  description: string | null;
  publicSlug: string | null;
  docMode: string;
  baseUrl: string | null;
  stats: {
    totalEndpoints: number;
    methods: Record<string, number>;
  };
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const searchTerm = typeof query.search === 'string' ? query.search.trim() : '';

    // Build where clause
    const baseCondition = eq(collections.isPublic, true);
    
    let publicCollections;
    
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      publicCollections = await db
        .select()
        .from(collections)
        .where(
          and(
            baseCondition,
            or(
              sql`${collections.name} ILIKE ${searchPattern}`,
              sql`${collections.description} ILIKE ${searchPattern}`
            )
          )
        )
        .orderBy(collections.name);
    } else {
      publicCollections = await db
        .select()
        .from(collections)
        .where(baseCondition)
        .orderBy(collections.name);
    }

    // Get all collection IDs for stats lookup
    const collectionIds = publicCollections.map(c => c.id);

    if (collectionIds.length === 0) {
      return { collections: [] };
    }

    // Fetch all folders for these collections
    const allFolders = await db
      .select({ id: folders.id, collectionId: folders.collectionId })
      .from(folders)
      .where(inArray(folders.collectionId, collectionIds));

    const folderIdList = allFolders.map(f => f.id);

    // Build request query: collection-level OR folder-level
    const allRequestsRaw = folderIdList.length > 0
      ? await db
          .select({
            id: savedRequests.id,
            collectionId: savedRequests.collectionId,
            folderId: savedRequests.folderId,
            method: savedRequests.method,
          })
          .from(savedRequests)
          .where(
            or(
              inArray(savedRequests.collectionId, collectionIds),
              inArray(savedRequests.folderId, folderIdList)
            )
          )
      : await db
          .select({
            id: savedRequests.id,
            collectionId: savedRequests.collectionId,
            folderId: savedRequests.folderId,
            method: savedRequests.method,
          })
          .from(savedRequests)
          .where(inArray(savedRequests.collectionId, collectionIds));

    // Group requests by collection
    const requestsByCollection: Record<string, { method: string }[]> = {};
    
    for (const req of allRequestsRaw) {
      let cid = req.collectionId;
      // If no collectionId, look up via folder
      if (!cid && req.folderId) {
        const folder = allFolders.find(f => f.id === req.folderId);
        cid = folder?.collectionId || null;
      }
      if (cid) {
        if (!requestsByCollection[cid]) requestsByCollection[cid] = [];
        requestsByCollection[cid].push({ method: req.method });
      }
    }

    // Build response
    const result: PublicCollection[] = publicCollections.map(collection => {
      const requests = requestsByCollection[collection.id] || [];
      const methods: Record<string, number> = {};
      
      requests.forEach(req => {
        methods[req.method] = (methods[req.method] || 0) + 1;
      });

      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        publicSlug: collection.publicSlug,
        docMode: collection.docMode || 'explorer',
        baseUrl: collection.baseUrl,
        stats: {
          totalEndpoints: requests.length,
          methods,
        },
      };
    });

    return { collections: result };
  } catch (error: any) {
    console.error('[collections-list] Error:', error?.message || error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch public collections',
    });
  }
});
