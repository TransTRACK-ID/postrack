# Postrack (v0.9.3)

## What Postrack Is

**Postrack** is a full-stack API workspace that helps developers build, test, mock, document, and share APIs — all in one place. Think of it as a lighter, more collaborative alternative to Postman and Insomnia, designed for teams who want to move fast without the heavyweight enterprise feel.

Whether you're prototyping a new API, running regression tests, generating mock responses for frontend development, or publishing public API documentation, Postrack gives you the tools to do it efficiently and beautifully.

### What You Can Do With It
- **Build & Test** — Construct HTTP requests with headers, auth, body, scripts, and multiple examples. Execute directly or through a built-in proxy to bypass CORS issues.
- **Mock APIs** — Generate collection-aware mock endpoints with configurable responses, delays, and status codes — perfect for frontend development without a real backend.
- **Import & Export** — Bring in OpenAPI (Swagger) and Postman collections, or export your workspace to OpenAPI spec.
- **Document** — Publish public API documentation from imported specs, or create rich collection docs with markdown, images, tables, and endpoint references.
- **Collaborate** — Share workspaces with teammates via unique tokens, manage access with view/edit permissions, and track request history.
- **Monitor** — Track usage analytics, monitor errors with Datadog integration, and collect team feedback — all from a unified admin panel.

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

### Collaboration & Sharing
- Workspace sharing with shareable links (view/edit permissions)
- Workspace member management and access control
- Shared workspace access via unique tokens
- Request history tracking and comparison

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

### Authentication
- Email/password authentication
- Optional SSO providers (Keycloak, Google, GitHub, Azure AD)
- JWT-based session management
- Secure token-based workspace sharing

### UI/UX Features
- Resizable sidebar with hide/show toggle
- Keyboard shortcuts support
- Toast notifications
- Version notifications on updates
- Responsive design

## Tech Stack

- **Frontend**: Nuxt 3, Vue 3, Tailwind CSS
- **Backend**: Nuxt Nitro server routes + middleware
- **Database**: PostgreSQL + Drizzle ORM + Drizzle migrations
- **Storage**: Redis (optional, recommended for production) or filesystem
- **Authentication**: JWT + SSO providers (Keycloak, Google, GitHub, Azure AD)
- **Monitoring**: Datadog APM and RUM integration
- **Utilities**:
  - `marked` + `highlight.js` for docs rendering
  - `@faker-js/faker` for mock data generation
  - `ioredis` for Redis integration
  - `uuid` for unique identifiers
  - `dd-trace` for server-side APM

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
   - `REDIS_URL` - Redis connection (optional, recommended for production)
   - `APP_ENV` - Environment (local, development, production)
   - `APP_DOMAIN` - Application domain
   
   Optional SSO configuration:
   - `KEYCLOAK_*` - Keycloak OAuth
   - `GOOGLE_CLIENT_ID/SECRET` - Google OAuth
   - `GITHUB_CLIENT_ID/SECRET` - GitHub OAuth
   - `AZURE_*` - Azure AD OAuth
   
   Optional Datadog monitoring:
   - `DATADOG_API_KEY` - Datadog API key for APM
   - `DATADOG_APPLICATION_ID` - Datadog application ID for RUM
   - `DATADOG_CLIENT_TOKEN` - Datadog client token for RUM
   - `DATADOG_SITE` - Datadog site (default: us5.datadoghq.com)

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
app/                    # Nuxt app pages/components
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
  components/           # Vue components
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
server/                 # API routes, middleware, services
  api/                  # API endpoints
    admin/              # Admin API routes
      super/            # Super admin endpoints
        usage/          # Usage analytics endpoints
        feedback/       # Feedback management endpoints
      collections/      # Collection management
      folders/          # Folder management
      requests/         # Request management
      environments/     # Environment management
      workspaces/       # Workspace management
      shares/           # Workspace sharing
      sso/              # SSO provider management
    auth/               # Authentication endpoints
      sso/              # SSO OAuth endpoints
    proxy/              # HTTP proxy execution
    definitions/        # API definition import/export
    history/            # Request history management
    feedback/           # Feedback submission endpoints
    analytics/          # Error analytics endpoints
    public/             # Public API endpoints
    shared-workspace/   # Shared workspace access
    scripts/            # Script execution
    utils/              # Utility endpoints
  middleware/           # Server middleware
    auth.ts             # JWT authentication middleware
  db/                   # Database layer
    schema/             # Drizzle schema definitions
      workspace.ts      # Workspace schema
      workspaceShare.ts # Workspace sharing schema
      workspaceMember.ts # Workspace members schema
      feedback.ts       # Feedback system schema
      usageAnalytics.ts # Usage tracking schema
      errorReport.ts    # Error reporting schema
      mocks.ts          # Mock configuration schema
      environment.ts    # Environment schema
      collection.ts     # Collection schema
      collectionDocBlock.ts # Collection documentation schema
      savedRequest.ts   # Saved requests schema
      requestExample.ts # Request examples schema
      requestHistory.ts # Request history schema
      settings.ts       # Settings schema
    seed.ts             # Database seed script
  services/             # Server services
    usageTracking.ts    # Usage tracking service
    usageAggregation.ts # Usage aggregation service
    script-runner.ts    # Script execution service
    migration.ts        # Migration service
  utils/                # Utility functions
    magic-variables.ts  # Postman-style magic variables
drizzle/                # SQL migrations
docs/                   # Markdown docs served by slug
scripts/                # Utility scripts (version bump, etc.)
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
- Collections with color coding and descriptions
- Nested folders with drag-and-drop reordering
- Requests with multiple examples and versions
- Collection-level authentication configuration

### Request Builder
- Full request builder with URL, method, headers, body
- Support for JSON, form-data, URL-encoded, raw, and binary body types
- Pre-request and post-request scripts
- Path variables with descriptions
- Query parameters with notes
- Multiple request examples per request
- Mock configuration per request
- Code examples generation
- Response comparison between different executions

### Environment Management
- Multiple environments per workspace
- Environment variables with secret support
- Variable inline editing with autocomplete
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
- View and edit permissions for shared workspaces
- Workspace expiration dates for share links
- Workspace member management
- Request history tracking and comparison

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
- ✅ `DATABASE_URL` - PostgreSQL connection
- ✅ `JWT_SECRET` - Strong random string
- ✅ `ADMIN_EMAIL` & `ADMIN_PASSWORD` - Non-default credentials
- ✅ `APP_URL` - Public application URL
- ✅ `APP_DOMAIN` - Application domain
- ✅ `REDIS_URL` - Redis connection (recommended)
- ✅ `APP_ENV` - Set to `production`
- Optional: SSO provider credentials
- Optional: Datadog monitoring credentials

## Testing Localhost APIs

Testing your local backend (e.g., `http://127.0.0.1:4000`) from the deployed app? Use the **Proxy/Direct toggle** next to the Send button:

| Mode | Use When | Backend CORS Required? |
|------|----------|----------------------|
| **Direct** (default) | Your backend has CORS enabled | ✅ Yes |
| **Proxy** (purple) | Your backend lacks CORS headers | ❌ No |

📖 **[Full Guide: Testing Localhost APIs](docs/testing-localhost-apis.md)**

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
- Environment variables are encrypted at rest (configure encryption in production)
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

### Admin Operations
- `GET /api/admin/tree` - Get full workspace tree structure
- `GET /api/admin/tree-light` - Get lightweight workspace tree
- `GET /api/admin/workspaces` - List all workspaces
- `POST /api/admin/workspaces` - Create new workspace
- `GET /api/admin/requests/:id` - Get request details
- `PUT /api/admin/requests/:id` - Update request
- `POST /api/admin/folders/:id/requests` - Create request in folder
- `GET /api/admin/collections` - List collections
- `POST /api/admin/collections` - Create collection
- `GET /api/admin/environments/:id` - Get environment details
- `PUT /api/admin/environments/:id/activate` - Activate environment
- `GET /api/admin/mocks` - List mock configurations
- `POST /api/admin/mocks` - Create mock configuration
- `GET /api/admin/export` - Export workspace to OpenAPI

### Proxy & Execution
- `POST /api/proxy/request` - Execute HTTP request through proxy
- `POST /api/scripts/execute` - Execute pre/post request scripts
- `POST /api/utils/parse-curl` - Parse cURL command

### Definitions & Import
- `POST /api/definitions/import` - Import OpenAPI definition
- `POST /api/definitions/import/postman` - Import Postman collection
- `GET /api/definitions/:id` - Get API definition
- `POST /api/definitions/:id/generate-mocks` - Generate mocks from definition

### History & Analytics
- `GET /api/history` - List request history
- `GET /api/history/:id` - Get history entry details
- `DELETE /api/history/:id` - Delete history entry
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
- `GET /api/admin/super/feedback/config` - Get feedback configuration
- `POST /api/admin/super/feedback/config` - Update feedback configuration
- `GET /api/admin/super/feedback/submissions` - List feedback submissions
- `GET /api/admin/super/projects` - List all projects (super admin)

### Shared Workspace
- `GET /api/shared-workspace/:token` - Get shared workspace details
- `GET /api/shared-workspace/:token/environments/:id/variables` - Get environment variables
- `POST /api/shared-workspace/:token/requests` - Create request (edit permission)
- `PUT /api/shared-workspace/:token/requests/:id` - Update request (edit permission)

## Database Schema

The application uses PostgreSQL with Drizzle ORM. Key tables include:

### Core Tables
- `workspaces` - User workspaces
- `projects` - Projects within workspaces
- `collections` - API collections
- `folders` - Folder organization within collections
- `saved_requests` - Saved API requests
- `request_examples` - Multiple examples per request
- `request_history` - Request execution history
- `environments` - Environment configurations
- `environment_variables` - Environment-specific variables
- `mocks` - Mock endpoint configurations
- `api_definitions` - Imported OpenAPI/Postman definitions

### Collaboration Tables
- `workspace_shares` - Shareable workspace links
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
- `settings` - Application settings with sync support
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

**Version**: 0.8.12  
**Last Updated**: 2026  
**Maintained by**: Postrack Team
