export type FolderRow = {
  id: string;
  parentFolderId: string | null;
  isSharedBase: boolean;
};

export function findSharedBaseFolder(allFolders: FolderRow[]): FolderRow | null {
  return allFolders.find(
    (folder) => folder.isSharedBase && folder.parentFolderId === null
  ) ?? null;
}

export function collectFolderSubtreeIds(
  allFolders: Array<{ id: string; parentFolderId: string | null }>,
  rootFolderId: string
): Set<string> {
  const ids = new Set<string>([rootFolderId]);

  const walk = (parentId: string) => {
    for (const folder of allFolders) {
      if (folder.parentFolderId === parentId) {
        ids.add(folder.id);
        walk(folder.id);
      }
    }
  };

  walk(rootFolderId);
  return ids;
}

export function countRequestsInFolderTree(
  folder: { requests?: unknown[]; children?: Array<{ requests?: unknown[]; children?: unknown[] }> }
): number {
  let count = folder.requests?.length ?? 0;
  for (const child of folder.children ?? []) {
    count += countRequestsInFolderTree(child);
  }
  return count;
}
