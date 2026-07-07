import type { Ref } from 'vue';

export interface AdminCollection {
  id: string;
  name: string;
  description?: string;
  color: string;
  order: number;
}

export interface AdminMock {
  id: string;
  collection: string;
  path: string;
  method: string;
  status: number;
  response: unknown;
  delay: number;
  secure: boolean;
}

export interface AdminShellPageBindings {
  headerProps?: Ref<Record<string, unknown>>;
  headerListeners?: Record<string, (...args: unknown[]) => void>;
  sidebarProps?: Ref<Record<string, unknown>>;
  sidebarListeners?: Record<string, (...args: unknown[]) => void>;
  onAfterSidebarRefresh?: () => Promise<void>;
}

export interface AdminShellPageMeta {
  /** Hide the shared request/workspace sidebar (page provides its own navigation). */
  hideSidebar?: boolean;
  /** Route to navigate when the header back button is clicked. */
  backTo?: string;
  /** Optional label for the header back button. */
  backLabel?: string;
}

declare module '#app' {
  interface PageMeta {
    adminShell?: AdminShellPageMeta;
  }
}
