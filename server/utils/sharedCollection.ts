import type { folders } from '../db/schema';

type FolderRow = typeof folders.$inferSelect;

export function getCollectionFolderIds(collectionId: string, allFolders: FolderRow[]): string[] {
  return allFolders.filter((folder) => folder.collectionId === collectionId).map((folder) => folder.id);
}

export function isRequestInCollection(
  request: { folderId: string | null; collectionId?: string | null },
  collectionId: string,
  allFolders: FolderRow[]
): boolean {
  if (request.collectionId === collectionId) {
    return true;
  }

  if (!request.folderId) {
    return false;
  }

  const folder = allFolders.find((item) => item.id === request.folderId);
  return folder?.collectionId === collectionId;
}
