import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from package.json
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))
const appVersion = packageJson.version || '0.0.0'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4
  },

  modules: ["@nuxtjs/tailwindcss"],

  css: [
    '@speed-highlight/core/dist/themes/atom-dark.css',
    '~/assets/css/main.css',
  ],

  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
        }
      ]
    }
  },
  nitro: {
    storage: {
      // File storage is now deprecated - all data stored in SQLite
      // Keeping minimal config for any future storage needs
    },
    // Include drizzle migrations in the build
    serverAssets: [
      {
        baseName: 'drizzle',
        dir: './drizzle'
      }
    ]
  },
  runtimeConfig: {
    buildTarget: process.env.BUILD_TARGET || 'web',
    adminEmail: process.env.ADMIN_EMAIL || 'admin@mock.com',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-change-me',
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Server-side only (SECRET) - Datadog configuration
    datadogApiKey: process.env.DATADOG_API_KEY,
    datadogSite: process.env.DATADOG_SITE || 'us5.datadoghq.com',
    datadogEnv: process.env.DATADOG_ENV || process.env.DD_ENV || 'development',
    
    // Client-side (PUBLIC) - Datadog RUM configuration
    public: {
      buildTarget: process.env.BUILD_TARGET || 'web',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      appVersion,
      ossRepositoryUrl: process.env.OSS_REPOSITORY_URL || 'https://github.com/TransTRACK-ID/postrack',
      
      // Datadog RUM Configuration
      datadogApplicationId: process.env.DATADOG_APPLICATION_ID,
      datadogClientToken: process.env.DATADOG_CLIENT_TOKEN,
      datadogSite: process.env.DATADOG_SITE || 'us5.datadoghq.com',
      datadogService: 'postrack-web',
      datadogEnv: process.env.DATADOG_ENV || process.env.DD_ENV || 'development',
      datadogVersion: appVersion,
    }
  }
})