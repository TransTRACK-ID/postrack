import { db } from '../../../db';
import { collections, savedRequests, folders } from '../../../db/schema';
import { eq, sql, count } from 'drizzle-orm';

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

interface PublicCollectionsResponse {
  collections: PublicCollection[];
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const searchTerm = typeof query.search === 'string' ? query.search.trim() : '';

    // Base query: only public collections
    const conditions = [eq(collections.isPublic, true)];
    
    // Add search filter if provided
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      conditions.push(
        sql`${collections.name} ILIKE ${searchPattern} OR ${collections.description} ILIKE ${searchPattern}`
      );
    }

    // Fetch public collections
    const publicCollections = await db
      .select()
      .from(collections)
      .where(sql`${conditions.map(c => c).join(' AND ')}`)
      .orderBy(collections.name);

    // Get all collection IDs for stats lookup
    const collectionIds = publicCollections.map(c => c.id);

    // Fetch all saved requests for these collections
    const allRequests = collectionIds.length > 0
      ? await db
          .select({
            collectionId: savedRequests.collectionId,
            folderId: savedRequests.folderId,
            method: savedRequests.method,
          })
          .from(savedRequests)
          .where(sql`${savedRequests.collectionId} IN ${collectionIds}`)
      : [];

    // Also get requests that belong to folders within these collections
    const folderIds = collectionIds.length > 0
      ? await db
          .select({ id: folders.id })
          .from(folders)
          .where(sql`${folders.collectionId} IN ${collectionIds}`)
      : [];

    const folderIdList = folderIds.map(f => f.id);

    const folderRequests = folderIdList.length > 0
      ? await db
          .select({
            collectionId: savedRequests.collectionId,
            folderId: savedRequests.folderId,
            method: savedRequests.method,
          })
          .from(savedRequests)
          .where(sql`${savedRequests.folderId} IN ${folderIdList}`)
      : [];

    // Combine all requests
    const allRequestsMap: Record<string, { method: string }[]> = {};
    
    for (const req of [...allRequests, ...folderRequests]) {
      const cid = req.collectionId || 'unknown';
      if (!allRequestsMap[cid]) allRequestsMap[cid] = [];
      allRequestsMap[cid].push({ method: req.method });
    }

    // Build response
    const result: PublicCollection[] = publicCollections.map(collection => {
      const requests = allRequestsMap[collection.id] || [];
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
    console.error('Error fetching public collections:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch public collections',
    });
  }
});
