export interface OwnableResource {
  createdBy?: string | null;
}

export function isResourceOwnedByUser(
  item: OwnableResource | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!item?.createdBy || !userId) {
    return false;
  }
  if (item.createdBy === userId) {
    return true;
  }
  // Ownership is stored as email for most auth flows; compare case-insensitively.
  if (item.createdBy.includes('@') && userId.includes('@')) {
    return item.createdBy.toLowerCase() === userId.toLowerCase();
  }
  return false;
}

export function canDeleteOwnedResource(
  item: OwnableResource | null | undefined,
  userId: string | null | undefined,
  isWorkspaceOwner: boolean,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin || isWorkspaceOwner) {
    return true;
  }
  return isResourceOwnedByUser(item, userId);
}
