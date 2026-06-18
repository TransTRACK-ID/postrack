export {}

declare global {
  interface Window {
    postrack?: {
      platform: NodeJS.Platform
      isElectron: boolean
    }
  }
}
