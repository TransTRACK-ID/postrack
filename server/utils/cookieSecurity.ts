export function shouldUseSecureCookie(appUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(appUrl)
    if (protocol !== 'https:') return false
    const host = hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false
    return true
  } catch {
    return false
  }
}
