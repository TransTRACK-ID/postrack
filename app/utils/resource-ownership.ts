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
  return item.createdBy === userId;
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
