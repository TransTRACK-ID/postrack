I have completed the deep analysis of the Postrack repository and generated the **System Design Document (SDD)**.

**Document saved to:**  
`/tmp/orbit-docs-repositories/2fcf32bc-2998-4fb0-8d70-f79fcdf6effb/api-testing-tools/SDD.md`

---

### What the SDD covers:

| Section | Key Content |
|--------|-------------|
| **1. Architecture Overview** | Three-tier monolithic architecture (Vue 3 SPA → Nitro Server → PostgreSQL), deployment topology with Traefik/Nginx + optional Datadog Agent sidecar |
| **2. Component & Service Design** | Nuxt 3.20.2/Vue 3 frontend with Tailwind dark theme, 50+ components, 20+ composables; Nitro REST backend with 150+ file-based API routes; detailed breakdown of Proxy, Script Runner, Mock Server, Usage Tracking, and SSO services |
| **3. Data Storage & Management** | PostgreSQL via Drizzle ORM with `pg` connection pool (max 50), 19 tables fully documented with columns, indexes, and purposes; in-memory cache utility (no active Redis integration) |
| **4. API Contracts & Data Flow** | Detailed request/response payload walkthrough for the core `POST /api/proxy/request` execution flow, including environment substitution, pre/post script execution, mock interception, error handling, and history logging |
| **5. Deployment & Infrastructure** | Multi-stage Dockerfile (Node 23 Alpine + Bun), GitLab CI/CD pipeline with AWX-triggered deployments, two Docker Compose variants (Traefik vs Nginx), and complete Datadog observability stack (APM, RUM, Browser Logs, Custom Metrics) |

The document contains **zero placeholders** — all content is derived directly from the actual codebase.