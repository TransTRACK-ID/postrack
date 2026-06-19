/**
 * Renderer half of the auto-update flow.
 *
 * Listens for the main process's `update-downloaded` IPC event (exposed on
 * `window.postrack` by the preload script) and surfaces it as a persistent
 * toast via the existing `useToast` composable. The update itself is applied
 * automatically on the next app quit (`autoInstallOnAppQuit`); this toast is
 * purely informational.
 *
 * Client-only by virtue of the `.client.ts` suffix, and additionally guarded
 * for non-Electron (web) builds where `window.postrack` is absent.
 */
export default defineNuxtPlugin(() => {
  const bridge = window.postrack
  if (!bridge?.isElectron || !bridge.onUpdateDownloaded) {
    return
  }

  const { showToast } = useToast()

  bridge.onUpdateDownloaded((info) => {
    showToast(`New version v${info.version} downloaded — restart to apply`, 'info', {
      duration: 0, // persist until dismissed
    })
  })
})
