import { ref, computed, onMounted } from 'vue'

const STORAGE_KEY = 'postrack-oss-banner-dismissed'

const isDismissed = ref(false)
const isHydrated = ref(false)

export function useOpenSourceBanner() {
  const config = useRuntimeConfig()

  const repositoryUrl = computed(
    () => (config.public.ossRepositoryUrl as string) || 'https://github.com/TransTRACK-ID/postrack'
  )

  const repositoryName = computed(() => {
    const url = repositoryUrl.value
    try {
      const { pathname } = new URL(url)
      const segments = pathname.split('/').filter(Boolean)
      if (segments.length >= 2) {
        return `${segments[0]}/${segments[1]}`
      }
    } catch {
      // Fall through to default label
    }
    return 'TransTRACK-ID/postrack'
  })

  const isVisible = computed(() => isHydrated.value && !isDismissed.value)

  const dismiss = () => {
    isDismissed.value = true
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }

  onMounted(() => {
    if (typeof window !== 'undefined') {
      isDismissed.value = localStorage.getItem(STORAGE_KEY) === 'true'
    }
    isHydrated.value = true
  })

  return {
    isVisible,
    dismiss,
    repositoryUrl,
    repositoryName
  }
}
