export interface AuthUserLike {
  id?: string | null;
  email?: string | null;
  sub?: string | null;
}

/**
 * Resolve the canonical user identifier used for ownership checks.
 * Must match server middleware: decoded.email || decoded.sub || decoded.id
 */
export function resolveAuthUserId(user: AuthUserLike | null | undefined): string | null {
  if (!user) return null;
  return user.email || user.sub || user.id || null;
}
