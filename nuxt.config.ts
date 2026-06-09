import { readFileSync } from 'fs'
import { resolve } from 'path'

// Detect desktop build mode
const isDesktopBuild = process.env.NUXT_DESKTOP_BUILD === 'true'

// Read version from package.json
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))
const appVersion = packageJson.version || '0.0.0'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: !isDesktopBuild },

  future: {
    compatibilityVersion: 4
  },

  modules: ["@nuxtjs/tailwindcss"],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      ...(isDesktopBuild ? {
        meta: [
          {
            'http-equiv': 'Content-Security-Policy',
            content: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:3000;"
          }
        ]
      } : {}),
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: isDesktopBuild
            ? 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
            : 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
        }
      ]
    }
  },
  nitro: {
    ...(isDesktopBuild ? {
      preset: 'node',
      output: {
        dir: '.output-desktop'
      }
    } : {}),
    storage: {
      // File storage is now deprecated - all data stored in SQLite
      // Keeping minimal config for any future storage needs
    },
    // Include drizzle migrations in the build
    serverAssets: [
      {
        baseName: 'drizzle',
        dir: './drizzle'
      },
      ...(isDesktopBuild ? [{
        baseName: 'drizzle-sqlite',
        dir: './drizzle-sqlite'
      }] : [])
    ]
  },
  runtimeConfig: {
    adminEmail: process.env.ADMIN_EMAIL || (isDesktopBuild ? 'admin@local' : 'admin@mock.com'),
    adminPassword: process.env.ADMIN_PASSWORD || (isDesktopBuild ? 'admin' : 'admin123'),
    jwtSecret: process.env.JWT_SECRET || (isDesktopBuild ? '' : 'super-secret-jwt-key-change-me'),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Server-side only (SECRET) - Datadog configuration
    datadogApiKey: process.env.DATADOG_API_KEY,
    datadogSite: process.env.DATADOG_SITE || 'us5.datadoghq.com',
    datadogEnv: process.env.DATADOG_ENV || process.env.DD_ENV || 'development',
    
    // Client-side (PUBLIC) - Datadog RUM configuration
    public: {
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      appVersion,
      isDesktop: isDesktopBuild,
      
      // Datadog RUM Configuration (disabled in desktop)
      datadogApplicationId: process.env.DATADOG_APPLICATION_ID,
      datadogClientToken: process.env.DATADOG_CLIENT_TOKEN,
      datadogSite: process.env.DATADOG_SITE || 'us5.datadoghq.com',
      datadogService: isDesktopBuild ? 'postrack-desktop' : 'postrack-web',
      datadogEnv: process.env.DATADOG_ENV || process.env.DD_ENV || 'development',
      datadogVersion: appVersion,
    }
  }
})
