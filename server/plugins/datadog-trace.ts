import tracer from 'dd-trace'
import { getDatadogLogger } from '../utils/datadog-logger'

export default defineNitroPlugin(() => {
  // Skip in desktop mode
  if (process.env.ELECTRON_DESKTOP) {
    console.log('[Datadog APM] Skipping initialization in desktop mode')
    return
  }

  const config = useRuntimeConfig()
  
  // Initialize the Datadog logger (for direct log shipping)
  // This creates the singleton instance early
  getDatadogLogger()
  
  // Skip in development if desired (unless forced)
  const forceEnable = process.env.DD_FORCE_ENABLE === 'true'
  if (config.datadogEnv === 'development' && !forceEnable) {
    console.log('[Datadog APM] Skipping initialization in development')
    return
  }

  // Check if dd-trace is already initialized via CLI flag (--require dd-trace/init)
  // This is the recommended way to ensure proper instrumentation
  const isAlreadyInitialized = tracer._tracer !== undefined
  
  if (!isAlreadyInitialized) {
    // Initialize tracer only if not already done via CLI
    tracer.init({
      service: 'postrack-api',
      env: config.datadogEnv,
      version: config.public.appVersion,
      site: config.datadogSite,
      logLevel: 'warn', // Reduce noise
      
      // Sampling - capture all traces initially
      sampleRate: 1,
      
      // Runtime metrics
      runtimeMetrics: true,
      
      // Enable log injection for correlation between logs and traces
      logInjection: true,
      
      // Profiling (optional, adds some overhead but useful for performance analysis)
      profiling: config.datadogEnv === 'production',
    })

    // Auto-instrument common packages
    tracer.use('http', {
      server: true,
      client: true,
      // Enable analytics for HTTP requests
      analytics: true,
    })
    
    tracer.use('net')
    tracer.use('dns')
    tracer.use('pg', {
      service: 'postrack-postgres',
      analytics: true,
    })
    
    // Enable additional instrumentation
    tracer.use('fs')

    console.log('[Datadog APM] Initialized via plugin', {
      service: 'postrack-api',
      env: config.datadogEnv,
      version: config.public.appVersion,
      logInjection: true
    })
  } else {
    // Configure additional instrumentation when initialized via CLI
    tracer.use('http', {
      server: true,
      client: true,
      analytics: true,
    })
    
    tracer.use('net')
    tracer.use('dns')
    tracer.use('pg', {
      service: 'postrack-postgres',
      analytics: true,
    })
    
    tracer.use('fs')

    console.log('[Datadog APM] Already initialized via CLI flag', {
      service: 'postrack-api',
      env: config.datadogEnv,
      version: config.public.appVersion
    })
  }
})
