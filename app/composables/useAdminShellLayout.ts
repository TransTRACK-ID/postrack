import type { AdminShellPageMeta } from '~/types/admin-shell';

const SIDEBARLESS_ADMIN_PATHS = new Set([
  '/admin/super-admin',
  '/admin/super-usage',
  '/admin/sso',
]);

const DEFAULT_ADMIN_BACK = {
  backTo: '/admin',
  backLabel: 'Back',
} as const;

export function resolveAdminShellMeta(meta: AdminShellPageMeta | undefined, path: string) {
  const hideSidebar = meta?.hideSidebar === true || SIDEBARLESS_ADMIN_PATHS.has(path);

  if (!hideSidebar) {
    return {
      hideSidebar: false,
      backTo: DEFAULT_ADMIN_BACK.backTo,
      backLabel: DEFAULT_ADMIN_BACK.backLabel,
    };
  }

  return {
    hideSidebar: true,
    backTo: meta?.backTo ?? DEFAULT_ADMIN_BACK.backTo,
    backLabel: meta?.backLabel ?? DEFAULT_ADMIN_BACK.backLabel,
  };
}

export function useAdminShellLayout() {
  const route = useRoute();
  return computed(() => resolveAdminShellMeta(route.meta.adminShell, route.path));
}
