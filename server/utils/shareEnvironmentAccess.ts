import type { ShareEnvironmentAccess } from '../db/schema/workspaceShare';

export function filterEnvironmentsForShare<T extends { id: string }>(
  environments: T[],
  options: { environmentAccess: ShareEnvironmentAccess; allowedIds: string[] }
): T[] {
  if (options.environmentAccess !== 'allowlist') {
    return environments;
  }

  const allowed = new Set(options.allowedIds);
  return environments.filter((environment) => allowed.has(environment.id));
}

export function resolveActiveEnvironmentId(
  activeEnvironmentId: string | null,
  filteredEnvironments: { id: string }[]
): string | null {
  if (!activeEnvironmentId) return null;
  return filteredEnvironments.some((environment) => environment.id === activeEnvironmentId)
    ? activeEnvironmentId
    : null;
}

export function isEnvironmentAllowedForShare(
  environmentId: string,
  options: { environmentAccess: ShareEnvironmentAccess; allowedIds: string[] }
): boolean {
  if (options.environmentAccess !== 'allowlist') {
    return true;
  }

  return options.allowedIds.includes(environmentId);
}

