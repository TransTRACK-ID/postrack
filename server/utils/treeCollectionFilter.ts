interface CollectionContainer {
  id: string;
  collections: Array<{ id: string }>;
  collectionCount?: number;
}

interface ProjectContainer {
  projects: CollectionContainer[];
  projectCount?: number;
}

export function filterWorkspaceTreeForCollectionOnlyAccess<T extends ProjectContainer>(
  workspace: T,
  allowedCollectionIds: string[] | undefined
): T {
  if (!allowedCollectionIds || allowedCollectionIds.length === 0) {
    return workspace;
  }

  const allowedSet = new Set(allowedCollectionIds);
  const filteredProjects = workspace.projects
    .map((project) => {
      const collections = project.collections.filter((collection) => allowedSet.has(collection.id));
      return {
        ...project,
        collections,
        collectionCount: collections.length
      };
    })
    .filter((project) => project.collections.length > 0);

  return {
    ...workspace,
    projects: filteredProjects,
    projectCount: filteredProjects.length
  };
}
