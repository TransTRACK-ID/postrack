# Postrack (v0.9.5)

A full-stack API workspace for building, testing, mocking, documenting, and sharing APIs.

Postrack provides a comprehensive web admin panel to manage requests and environments, run HTTP calls through a proxy or directly, generate mock endpoints, import API definitions (OpenAPI/Postman), publish documentation, track usage analytics, monitor errors, collect feedback, and collaborate with team members.

## Key Features

### Core API Management
- Workspace-based API organization (workspaces, projects, collections, folders, requests)
- Request builder with headers, auth, body, scripts, pre/post request scripts, and multiple examples
- HTTP proxy execution with environment variable substitution
- Direct and Proxy execution modes for handling CORS with localhost APIs
- Postman-style magic variables (`{{$timestamp}}`, `{{$guid}}`, `{{$randomInt}}`, `{{$randomFirstName}}`, etc.)
- Cloud mock routing via collection-aware endpoints
- OpenAPI/Postman import support with automatic mock generation
- Export workspace to OpenAPI specification
- Public API documentation from imported specs
- Collection documentation pages with markdown blocks, images, tables, and endpoint references
- Public markdown documentation pages
- JSONC support in request bodies (comments and trailing commas allowed)

### Authentication & Authorization
- Email/password authentication
- Optional SSO providers (Keycloak, Google, GitHub, Azure AD)
- JWT-based session management
- Secure token-based workspace sharing
- Collection-level authentication inheritance (API Key, Bearer, Basic, OAuth2)
- OAuth2 token exchange and storage helpers

### Collaboration & Sharing
- Workspace sharing with shareable links (view/edit permissions)
- Folder-scoped sharing — limit shared access to a specific folder
- Workspace member management and access control
- Shared workspace access via unique tokens
- Shared workspace UI with resizable/toggleable sidebars and environment switcher
- Request history tracking and comparison
- Request tab session persistence across reloads

### Analytics & Monitoring
- Usage analytics dashboard (super admin)
- Error analytics and reporting with Datadog integration
- Request execution tracking with response times
- Daily/weekly/monthly usage statistics
- User and workspace activity trends
- Success rate monitoring

### Admin Features
- Super admin panel for system management
- Feedback system with configurable forms
- Public feedback with voting and visibility controls
- SSO provider management (Keycloak, Google, GitHub, Azure AD)
- Workspace and user management
- Environment and variable management
- Settings sync across sessions

### UI/UX Features
- Resizable sidebar with hide/show toggle
- Keyboard shortcuts support
- Toast notifications
- Version notifications on updates
- Variable tooltip hover previews with secret masking
- Response panel loading state with elapsed timer
- Responsive design

## Tech Stack

- **Frontend**: Nuxt 3.20.2, Vue 3 (latest), Tailwind CSS via `@nuxtjs/tailwindcss` 6.14.0
- **Backend**: Nuxt Nitro server routes + middleware + plugins
- **Database**: PostgreSQL + Drizzle ORM 0.38.3 + Drizzle Kit 0.30.1 + Drizzle migrations
- **Storage**: Redis (optional, recommended for production) or filesystem
- **Authentication**: JWT + SSO providers (Keycloak, Google, GitHub, Azure AD)
- **Monitoring**: Datadog APM and RUM integration
- **Testing**: Vitest 3.0.0 with jsdom and `@vue/test-utils`
- **Utilities**:
  - `marked` 17 + `highlight.js` 11 for docs rendering
  - `@faker-js/faker` 9 for mock data generation
  - `ioredis` 5 for Redis integration
  - `uuid` 13 for unique identifiers
  - `dd-trace` 4 for server-side APM
  - `@vercel/kv` 1 for Vercel KV integration
  - `perfect-debounce` 2 for UI debouncing

## Requirements

- Node.js 20+ (recommended)
- npm (or pnpm/yarn/bun)
- PostgreSQL database
- Redis (optional, recommended for production deployments)

## Quick Start

1. **Clone repository**
2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create environment file**

   ```bash
   cp .env.example .env
   ```

4. **Configure required env vars** in `.env`
   - `DATABASE_URL` - PostgreSQL connection string
   - `ADMIN_EMAIL` - Default admin email
   - `ADMIN_PASSWORD` - Default admin password (change in production!)
   - `JWT_SECRET` - Secret for JWT tokens (use strong random string in production!)
   - `APP_URL` - Public application URL (for OAuth callbacks)
   - `APP_HOST` - Application host (default: `localhost`)
   - `APP_DOMAIN` - Application domain
   - `APP_ENV` - Environment (`local`, `development`, `production`)
   - `NODE_ENV` - Node environment (`development`, `production`)
   - `REDIS_URL` - Redis connection (optional, recommended for production)
   - `VERCEL` - Set to `true` when deploying to Vercel (auto-enables Redis storage)

   Optional Docker / deployment configuration:
   - `IMAGE_NAME` - Docker image name
   - `COMPOSE_PROJECT_NAME` - Docker Compose project name
   - `COMPOSE_REPLICAS` - Number of replicas for deployment
   - `COMPOSE_PUBLIC_PORT` - Public port mapped by the reverse proxy

   Optional SSO configuration:
   - `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_BASE_URL`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`

   Optional Datadog monitoring:
   - `DATADOG_API_KEY` - Datadog API key for APM
   - `DATADOG_APPLICATION_ID` - Datadog application ID for RUM
   - `DATADOG_CLIENT_TOKEN` - Datadog client token for RUM
   - `DATADOG_SITE` - Datadog site (default: `us5.datadoghq.com`)
   - `DATADOG_ENV` - Datadog environment tag

5. **Run database migrations**

   ```bash
   npm run db:migrate
   ```

6. **(Optional) seed default workspace/project**

   ```bash
   npm run db:seed
   ```

7. **Start development server**

   ```bash
   npm run dev
   ```

   Or for production with Datadog APM:
   ```bash
   npm run start
   ```

App runs at `http://localhost:3000`.

## Default Login (from env defaults)

- Email: `admin@mock.com`
- Password: `admin123`

Change these values before any production use.

## Available Scripts

### App lifecycle

- `npm run dev` - Run local development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run generate` - Generate static output
- `npm run start` - Start production server with Datadog APM

### Database (Drizzle)

- `npm run db:generate` - Generate migration files from schema
- `npm run db:migrate` - Apply migrations
- `npm run db:push` - Push schema directly to database
- `npm run db:studio` - Open Drizzle Studio
- `npm run db:seed` - Seed default workspace/project data

### Versioning

- `npm run version:patch|minor|major`
- `npm run version:patch:push|minor:push|major:push`

### Testing

- `npm run test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:ui` - Run tests with UI

## Project Structure

```text
app/                    # Nuxt app pages/components/composables
  pages/                # Application pages
    admin/              # Admin panel pages
      index.vue         # Main admin dashboard
      [id].vue          # Workspace-specific admin panel
      create.vue        # Create new workspace
      super-admin.vue   # Super admin management
      super-usage.vue   # Usage analytics dashboard
      error-analytics.vue # Error analytics dashboard
      sso.vue           # SSO provider management
      definitions/      # API definitions management
      environments/     # Environment management
    shared-workspace/   # Shared workspace access
    docs/               # Public API documentation
    docs-static/        # Public markdown docs
    collection-docs/    # Public collection documentation
    feedback/           # Feedback pages
      public.vue        # Public feedback with voting
      my-submissions.vue # My feedback submissions
  components/           # Vue components (see folder for full list)
    RequestBuilder.vue  # Request builder component
    MockConfiguration.vue # Mock config component
    FeedbackModal.vue   # Feedback collection modal
    ShareWorkspaceModal.vue # Workspace sharing modal
    EnvironmentSwitcher.vue # Environment selector
    WorkspaceSwitcher.vue # Workspace selector
    AppSidebar.vue      # Resizable sidebar with drag-and-drop
    AppHeader.vue       # App header with actions
    RequestHistoryPanel.vue # Request history
    ResponseComparison.vue # Response comparison view
    ApiDocumentationViewer.vue # API documentation viewer
    CollectionDocBlocksEditor.vue # Collection documentation editor
    VersionNotification.vue # Version update notifications
    VariableTooltip.vue # Variable hover preview tooltip
  composables/          # Vue composables (keyboard shortcuts, toasts, tracking, etc.)
  utils/                # Client utilities (auth helpers, JSONC helpers)
assets/                 # Static assets and global styles
server/                 # API routes, middleware, plugins, services
  api/                  # API endpoints (see folder for exhaustive list)
    admin/              # Admin API routes
      super/            # Super admin endpoints
      collections/      # Collection management
      folders/          # Folder management
      requests/         # Request management
      environments/     # Environment management
      workspaces/       # Workspace management
      shares/           # Workspace sharing
      sso/              # SSO provider management
    auth/               # Authentication endpoints
    proxy/              # HTTP proxy execution
    definitions/        # API definition import/export
    history/            # Request history management
    feedback/           # Feedback submission endpoints
    analytics/          # Error analytics endpoints
    public/             # Public API endpoints
    shared-workspace/   # Shared workspace access
    oauth/              # OAuth token exchange helpers
    scripts/            # Script execution
    utils/              # Utility endpoints
  middleware/           # Server middleware
    auth.ts             # JWT authentication middleware
    error-logger.ts     # Error logging middleware
  plugins/              # Nitro plugins (migrations, Datadog tracing, seeding, error handling)
  db/                   # Database layer
    schema/             # Drizzle schema definitions
    seed.ts             # Database seed script
  services/             # Server services
    usageTracking.ts    # Usage tracking service
    usageAggregation.ts # Usage aggregation service
    script-runner.ts    # Script execution service
    migration.ts        # Migration service
  utils/                # Server utilities
    magic-variables.ts  # Postman-style magic variables
    variable-substitution.ts # Env variable substitution
    openapi-parser.ts   # OpenAPI parsing
    postman-parser.ts   # Postman collection parsing
    curl-parser.ts      # cURL parsing
    cache.ts            # Server-side caching helpers
    datadog-*.ts        # Datadog metrics/logging helpers
    error-tracking.ts   # Error tracking helpers
    permissions.ts      # Permission checks
    userMapping.ts      # SSO user mapping helpers
    yaml-parser.ts      # YAML parsing helpers
    schema-generator.ts # OpenAPI export generation
drizzle/                # SQL migrations
docs/                   # Markdown docs served by slug
scripts/                # Utility scripts (version bump, Datadog test)
tests/                  # Unit and integration tests
```

## Public Routes

### Authentication
- `/login` - Login page (credentials + configured SSO providers)

### Documentation
- `/docs/:slug` - Public OpenAPI documentation from imported specs
- `/docs-static/:slug` - Public markdown documentation pages
- `/collection-docs/:slug` - Public collection documentation pages

### Mock Endpoints
- `/c/:collection/:path` - Collection-based mock endpoint route

### Shared Workspaces
- `/shared-workspace/:token` - Access shared workspace via share token

### Feedback
- `/feedback/public` - Public feedback with voting
- `/feedback/my-submissions` - My feedback submissions

### Admin Panel
- `/admin` - Main admin dashboard
- `/admin/:id` - Workspace-specific admin panel
- `/admin/create` - Create new workspace
- `/admin/super-admin` - Super admin management panel
- `/admin/super-usage` - Usage analytics dashboard
- `/admin/error-analytics` - Error analytics dashboard
- `/admin/sso` - SSO provider configuration
- `/admin/definitions` - API definitions management
- `/admin/environments` - Environment management

## Main Features

### Workspace & Collection Management
- Create and manage multiple workspaces
- Projects within workspaces for better organization
- Collections with color coding, descriptions, and collection-level auth config
- Nested folders with drag-and-drop reordering
- Requests with multiple examples and versions
- Collection-level authentication inheritance (API Key, Bearer, Basic, OAuth2)

### Request Builder
- Full request builder with URL, method, headers, body
- Support for JSON, form-data, URL-encoded, raw, and binary body types
- JSONC support in JSON bodies (comments and trailing commas)
- Pre-request and post-request scripts with environment variable propagation
- Path variables with descriptions
- Query parameters with notes and enabled/disabled state preservation
- Multiple request examples per request
- Mock configuration per request
- Code examples generation
- Response comparison between different executions
- Response panel loading state with elapsed timer
- Variable tooltip hover previews

### Environment Management
- Multiple environments per workspace
- Environment variables with secret support
- Variable inline editing with autocomplete and sync
- Environment activation and switching
- Environment duplication

### Mock Server
- Collection-based mock endpoints
- Configurable status code, delay, and response
- Secure mock endpoints option
- Automatic mock generation from OpenAPI specs
- Magic variables for dynamic mock data

### Documentation
- Public API documentation from imported OpenAPI specs
- Collection documentation with markdown blocks, images, tables, and endpoint references
- Public markdown documentation pages
- Request documentation panel with param schemas
- Published collection documentation pages

### Import & Export
- OpenAPI (Swagger) import with automatic mock generation
- Postman collection import
- Export workspace to OpenAPI specification

### Collaboration
- Workspace sharing with unique tokens
- Folder-scoped shares limit access to a single folder
- View and edit permissions for shared workspaces
- Workspace expiration dates for share links
- Workspace member management
- Request history tracking and comparison
- Persisted request tab sessions across reloads

### Feedback System
- Configurable feedback forms (super admin)
- Multiple question types (rating, text, multiple choice, single choice)
- Time-window control for feedback collection
- Public feedback with voting and visibility
- Anonymous feedback support
- Feedback analytics and submissions review
- My submissions tracking with status

### Error Analytics
- Error tracking with Datadog integration
- Error severity classification (error, warning, critical)
- Error status tracking (open, investigating, resolved, ignored)
- Browser and environment context
- Resolution notes and history
- Date range filtering

### Usage Analytics
- Track all API operations (requests, collections, folders, mocks, environments)
- View daily/weekly/monthly usage statistics
- Monitor user and workspace activity
- Analyze response times and success rates
- Export usage data for reporting

### Settings & Configuration
- Workspace settings with sync support
- SSO provider management (Keycloak, Google, GitHub, Azure AD)
- Super admin configuration
- Version tracking and notifications
- Settings sync across sessions
- Request tab session persistence

## Deployment Notes

### Docker Deployment
- Docker and compose templates are included:
  - `Dockerfile` - Production-ready container
  - `docker-compose.yml` - Basic deployment with Traefik and optional Datadog agent
  - `docker-compose.deployment.nginx.yml` - Nginx reverse proxy setup
  - `docker-compose.deployment.traefik.yml` - Traefik reverse proxy setup
- Configure replicas via `COMPOSE_REPLICAS` env var
- Set public port via `COMPOSE_PUBLIC_PORT`
- Datadog agent included for monitoring (optional, requires `DATADOG_API_KEY`)

### Production Requirements
- Use Redis for storage (`REDIS_URL` required for multi-instance deployments)
- Configure strong `JWT_SECRET` (minimum 32 characters)
- Change default admin credentials before deployment
- Set proper `APP_URL` for OAuth callbacks
- Configure `APP_DOMAIN` for proper cookie handling
- Enable HTTPS in production
- Configure Datadog for monitoring (optional)

### Environment Variables Checklist
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - Strong random string
- `ADMIN_EMAIL` & `ADMIN_PASSWORD` - Non-default credentials
- `APP_URL` - Public application URL
- `APP_HOST` - Application host
- `APP_DOMAIN` - Application domain
- `APP_ENV` - Set to `production`
- `NODE_ENV` - Set to `production`
- `REDIS_URL` - Redis connection (recommended)
- Optional: SSO provider credentials
- Optional: Datadog monitoring credentials
- Optional: `COMPOSE_REPLICAS`, `COMPOSE_PUBLIC_PORT`, `IMAGE_NAME`, `COMPOSE_PROJECT_NAME`

## Testing Localhost APIs

Testing your local backend (e.g., `http://127.0.0.1:4000`) from the deployed app? Use the **Proxy/Direct toggle** next to the Send button:

| Mode | Use When | Backend CORS Required? |
|------|----------|----------------------|
| **Direct** (default) | Your backend has CORS enabled | Yes |
| **Proxy** (purple) | Your backend lacks CORS headers | No |

**[Full Guide: Testing Localhost APIs](docs/testing-localhost-apis.md)**

### Quick CORS Setup

**Flask:** `from flask_cors import CORS; CORS(app)`  
**Express:** `app.use(cors())`  
**FastAPI:** Use `CORSMiddleware`

---

## Security Notes

### Authentication & Access Control
- Do not commit `.env` files or secrets to version control
- Use strong values for `JWT_SECRET` in production (minimum 32 characters)
- Replace default admin credentials (`admin@mock.com` / `admin123`) before deployment
- Configure SSO providers with proper redirect URIs matching your `APP_URL`
- Workspace share tokens should be treated as sensitive - revoke when no longer needed

### Data Security
- All API routes under `/api/admin` require authentication
- Shared workspace access is controlled via token validation
- Environment variables should be encrypted at rest in production
- Request history and usage analytics are user/workspace scoped

### Network Security
- Enable HTTPS in production deployments
- Configure proper CORS settings if needed
- Use reverse proxy (Nginx/Traefik) for production deployments
- Set appropriate rate limits for API endpoints

### Database Security
- Use connection pooling for production deployments
- Configure PostgreSQL with proper access controls
- Regular backups of database and Redis data
- Monitor database performance and usage

## API Endpoints Overview

### Authentication
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/logout` - Logout current session
- `GET /api/auth/check` - Check authentication status
- `GET /api/auth/sso/providers` - List available SSO providers
- `GET /api/auth/sso/:provider/login` - Initiate SSO login
- `GET /api/auth/sso/:provider/callback` - SSO callback handler

### OAuth Helpers
- `GET /api/oauth/callback` - OAuth callback receiver
- `POST /api/oauth/token` - Exchange code for token
- `POST /api/oauth/store-tokens` - Store retrieved tokens

### Admin Operations
- `GET /api/admin/tree` - Get full workspace tree structure
- `GET /api/admin/tree-light` - Get lightweight workspace tree
- `GET /api/admin/workspaces` - List all workspaces
- `POST /api/admin/workspaces` - Create new workspace
- `GET /api/admin/workspaces/:id` - Get workspace details
- `PUT /api/admin/workspaces/:id` - Update workspace
- `DELETE /api/admin/workspaces/:id` - Delete workspace
- `GET /api/admin/workspaces/:id/shares` - List workspace shares
- `POST /api/admin/workspaces/:id/shares` - Create workspace share
- `GET /api/admin/requests/:id` - Get request details
- `PUT /api/admin/requests/:id` - Update request
- `DELETE /api/admin/requests/:id` - Delete request
- `POST /api/admin/requests/:id/move` - Move request to another folder/collection
- `POST /api/admin/requests/reorder` - Reorder requests
- `GET /api/admin/requests/:id/examples` - List request examples
- `POST /api/admin/requests/:id/examples` - Create request example
- `PUT /api/admin/requests/:id/examples/:exampleId` - Update request example
- `DELETE /api/admin/requests/:id/examples/:exampleId` - Delete request example
- `POST /api/admin/collections` - Create collection
- `GET /api/admin/collections` - List collections
- `PUT /api/admin/collections/:id` - Update collection
- `DELETE /api/admin/collections/:id` - Delete collection
- `GET /api/admin/collections/:id/auth` - Get collection auth config
- `POST /api/admin/collections/:id/auth` - Update collection auth config
- `POST /api/admin/collections/:id/folders` - Create folder in collection
- `POST /api/admin/collections/:id/requests` - Create request in collection
- `GET /api/admin/collections/:id/doc-blocks` - List collection doc blocks
- `POST /api/admin/collections/:id/doc-blocks` - Create doc block
- `POST /api/admin/collections/:id/doc-blocks/reorder` - Reorder doc blocks
- `GET /api/admin/folders/:id` - Get folder details
- `PUT /api/admin/folders/:id` - Update folder
- `DELETE /api/admin/folders/:id` - Delete folder
- `POST /api/admin/folders/:id/requests` - Create request in folder
- `POST /api/admin/folders/reorder` - Reorder folders
- `GET /api/admin/environments/:id` - Get environment details
- `PUT /api/admin/environments/:id` - Update environment
- `DELETE /api/admin/environments/:id` - Delete environment
- `POST /api/admin/environments/:id/duplicate` - Duplicate environment
- `PUT /api/admin/environments/:id/activate` - Activate environment
- `GET /api/admin/environments/:id/variables` - List environment variables
- `POST /api/admin/environments/:id/variables` - Create environment variable
- `GET /api/admin/variables/:id` - Get variable details
- `PUT /api/admin/variables/:id` - Update variable
- `DELETE /api/admin/variables/:id` - Delete variable
- `GET /api/admin/mocks` - List mock configurations
- `POST /api/admin/mocks` - Create mock configuration
- `PUT /api/admin/mocks` - Update mock configuration
- `DELETE /api/admin/mocks` - Delete mock configuration
- `GET /api/admin/export` - Export workspace to OpenAPI
- `GET /api/admin/magic-variables` - List magic variables
- `POST /api/admin/resource` - Create/update mock resource directly
- `GET /api/admin/migrate` - List migration status
- `POST /api/admin/migrate` - Run migrations
- `POST /api/admin/migrate/rollback` - Rollback migration
- `GET /api/admin/settings` - Get settings (supports `?key=requestTabsSession`)
- `POST /api/admin/settings` - Update settings
- `DELETE /api/admin/shares/:token` - Revoke workspace share

### Proxy & Execution
- `POST /api/proxy/request` - Execute HTTP request through proxy
- `POST /api/scripts/execute` - Execute pre/post request scripts
- `POST /api/utils/parse-curl` - Parse cURL command

### Definitions & Import
- `POST /api/definitions/import` - Import OpenAPI definition
- `POST /api/definitions/import/postman` - Import Postman collection
- `GET /api/definitions` - List API definitions
- `GET /api/definitions/:id` - Get API definition
- `PUT /api/definitions/:id` - Update API definition
- `DELETE /api/definitions/:id` - Delete API definition
- `POST /api/definitions/:id/generate-mocks` - Generate mocks from definition

### History & Analytics
- `GET /api/history` - List request history
- `GET /api/history/:id` - Get history entry details
- `DELETE /api/history/:id` - Delete history entry
- `DELETE /api/history` - Clear all history
- `POST /api/history/log` - Log request execution
- `GET /api/analytics/errors` - Get error analytics

### Feedback
- `GET /api/feedback/status` - Check feedback form status (public)
- `POST /api/feedback/submit` - Submit feedback (authenticated)
- `GET /api/feedback/public` - Get public feedback submissions
- `POST /api/feedback/:id/vote` - Vote on feedback
- `PUT /api/feedback/:id/visibility` - Update feedback visibility
- `POST /api/feedback/:id/comment` - Comment on feedback
- `GET /api/feedback/my-submissions` - Get my feedback submissions

### Super Admin
- `GET /api/admin/super/check` - Check super admin status
- `GET /api/admin/super/usage/overview` - Usage overview stats
- `GET /api/admin/super/usage/users` - User usage statistics
- `GET /api/admin/super/usage/workspaces` - Workspace usage statistics
- `GET /api/admin/super/usage/trends` - Usage trends
- `GET /api/admin/super/usage/events` - Usage events
- `GET /api/admin/super/projects` - List all projects
- `GET /api/admin/super/feedback/config` - Get feedback configuration
- `POST /api/admin/super/feedback/config` - Update feedback configuration
- `GET /api/admin/super/feedback/submissions` - List feedback submissions
- `PUT /api/admin/super/feedback/submissions/:id` - Update submission status
- `GET /api/admin/super/feedback/submissions/:id/history` - Get submission history
- `GET /api/admin/super/workspaces/:id/members` - List workspace members
- `POST /api/admin/super/workspaces/:id/members` - Add workspace member

### Shared Workspace
- `GET /api/shared-workspace/:token` - Get shared workspace details
- `GET /api/shared-workspace/:token/environments/:id/variables` - Get environment variables
- `POST /api/shared-workspace/:token/requests` - Create request (edit permission)
- `PUT /api/shared-workspace/:token/requests/:id` - Update request (edit permission)

### Usage Tracking
- `POST /api/admin/usage/track` - Track a single usage event
- `POST /api/admin/usage/track-batch` - Track multiple usage events

## Database Schema

The application uses PostgreSQL with Drizzle ORM. Key tables include:

### Core Tables
- `workspaces` - User workspaces
- `projects` - Projects within workspaces
- `collections` - API collections (includes `auth_config` for collection-level auth)
- `folders` - Folder organization within collections
- `saved_requests` - Saved API requests
- `request_examples` - Multiple examples per request
- `request_history` - Request execution history
- `environments` - Environment configurations
- `environment_variables` - Environment-specific variables
- `mocks` - Mock endpoint configurations
- `api_definitions` - Imported OpenAPI/Postman definitions

### Collaboration Tables
- `workspace_shares` - Shareable workspace links (supports folder-scoped shares via `folder_id`)
- `workspace_members` - Workspace member management
- `workspace_access` - Access control records

### Documentation Tables
- `collection_doc_blocks` - Collection documentation blocks

### Analytics Tables
- `usage_events` - Individual usage events
- `daily_usage_stats` - Aggregated daily statistics
- `error_reports` - Error reports with Datadog correlation

### Feedback Tables
- `feedback_config` - Feedback form configuration
- `feedback_submissions` - User feedback submissions

### Settings Tables
- `settings` - Application settings with sync support and request tab sessions
- `sso_providers` - SSO provider configurations

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style and conventions
- Write tests for new features
- Update documentation for API changes
- Ensure all migrations are reversible
- Test with both Redis and filesystem storage

## License

This project is licensed under the MIT License. See `LICENSE` for details.

## Support

For issues and feature requests, please use the GitHub issue tracker.

---

**Version**: 0.9.5  
**Last Updated**: 2026  
**Maintained by**: Postrack Team
