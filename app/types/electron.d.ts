export {}

declare global {
  interface Window {
    postrack?: {
      platform: NodeJS.Platform
      isElectron: boolean
      /** Fired by the main process when a new update has been downloaded. */
      onUpdateDownloaded?: (callback: (info: { version: string }) => void) => void
      /** Triggers `quitAndInstall()` in the main process (restart + update). */
      installUpdate?: () => void
    }
  }
}
