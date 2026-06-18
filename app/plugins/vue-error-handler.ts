import { datadogRum } from '@datadog/browser-rum'

export default defineNuxtPlugin((nuxtApp) => {
  // Handle Vue component errors
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    const route = useRoute()
    
    // Extract component name
    const componentName = instance?.$options?.name || 
                          instance?.$options?.__name || 
                          'AnonymousComponent'
    
    // Add error to Datadog with context
    datadogRum.addError(error as Error, {
      type: 'vue_error',
      component: componentName,
      info: info,
      route: route.path,
      routeName: route.name,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    })

    // Also log to console for development
    console.error('[Vue Error]', {
      component: componentName,
      info,
      error
    })
  }

  // Handle Vue warnings (development mode issues)
  const originalWarn = console.warn
  console.warn = (...args) => {
    // Safely stringify each arg — Vue passes Symbol values (e.g. Symbol(teleport))
    // which throw on implicit toString in Array.join()
    const safeStringify = (arg: unknown): string => {
      try {
        if (typeof arg === 'symbol') return arg.toString()
        if (typeof arg === 'object' && arg !== null) {
          // Don't JSON-stringify Error objects or Vue internals; just use String()
          return String(arg)
        }
        return String(arg)
      } catch {
        return '[unstringifiable]'
      }
    }
    const message = args.map(safeStringify).join(' ')
    
    datadogRum.addError(new Error(message), {
      type: 'vue_warning',
      args: args.map(a => typeof a === 'symbol' ? a.toString() : a),
    })
    originalWarn.apply(console, args)
  }
})
