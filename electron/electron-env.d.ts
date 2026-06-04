export {};

declare global {
  interface Window {
    electronAPI: {
      // Auto-updater
      checkForUpdates: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateDownloading: (callback: () => void) => void;
      onUpdateProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      onUpdateError: (callback: (message: string) => void) => void;
      installUpdate: () => Promise<void>;

      // Native dialogs
      importFile: (filters?: any) => Promise<{ success: boolean; content?: string; filename?: string }>;
      exportFile: (data: { content: string; filename: string }) => Promise<{ success: boolean }>;

      // Native notifications
      showNotification: (data: { title: string; body: string }) => Promise<void>;

      // App info
      getAppVersion: () => Promise<string>;

      // Platform
      getPlatform: () => Promise<string>;

      // Deep link protocol
      onOpenWorkspace: (callback: (workspaceId: string) => void) => void;

      // Tray events
      onTrayNewRequest: (callback: () => void) => void;
    };
  }
}
