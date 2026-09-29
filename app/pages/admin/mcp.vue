<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  adminShell: {
    hideSidebar: true,
    backTo: '/admin',
    backLabel: 'Workspace',
  },
});

const { showToast } = useToast();

const origin = computed(() =>
  typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'
);

const mcpEndpoint = computed(() => `${origin.value}/api/mcp/connect`);
const sseEndpoint = computed(() => `${origin.value}/mcp`);

const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`);
  } catch {
    showToast('Failed to copy to clipboard', 'error');
  }
};

const clientConfigJson = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        postrack: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpEndpoint.value],
        },
      },
    },
    null,
    2
  )
);

const clientConfigWithKeyJson = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        postrack: {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            mcpEndpoint.value,
            '--header',
            'Authorization: Bearer YOUR_MCP_API_KEY',
          ],
        },
      },
    },
    null,
    2
  )
);

const inspectorCommand = 'npx @modelcontextprotocol/inspector';

const readTools = [
  { name: 'list_workspaces', description: 'List workspaces the authenticated user can access' },
  { name: 'get_workspace_tree', description: 'Full project → collection → folder → request hierarchy' },
  { name: 'list_endpoints', description: 'List endpoints in a collection or folder' },
  { name: 'get_endpoint', description: 'Full endpoint details: headers, params, body, responses' },
  { name: 'list_folders', description: 'List folders in a collection (including nested)' },
  { name: 'list_environments', description: 'List environments for a project' },
  { name: 'get_environment', description: 'Environment details with variables (secrets masked)' },
];

const writeTools = [
  { name: 'create_endpoint', description: 'Create an endpoint in a collection or folder' },
  { name: 'update_endpoint', description: 'Patch method, URL, headers, body, responses, and more' },
  { name: 'create_folder', description: 'Create a folder, optionally nested via parentFolderId' },
  { name: 'create_environment', description: 'Create an environment with variables' },
  { name: 'update_environment', description: 'Rename or activate an environment' },
  { name: 'set_environment_variable', description: 'Create or update a variable by key' },
];

const envVars = [
  { name: 'MCP_API_KEY', description: 'Static bearer key. Accepts Authorization: Bearer or X-API-Key.' },
  { name: 'MCP_API_KEY_USER', description: 'Bind the API key to an account email — tools then act with that account\u2019s workspace permissions. Unset = service account (full access).' },
  { name: 'MCP_OAUTH_CLIENT_ID', description: 'Enables OAuth 2.0 + PKCE when set with the secret.' },
  { name: 'MCP_OAUTH_CLIENT_SECRET', description: 'Pairs with the client ID to enable OAuth.' },
  { name: 'MCP_OAUTH_ISSUER', description: 'Public base URL for OAuth metadata. Defaults to APP_URL.' },
  { name: 'MCP_OAUTH_SIGNING_SECRET', description: 'JWT signing secret. Defaults to JWT_SECRET.' },
  { name: 'MCP_OAUTH_TOKEN_EXPIRY', description: 'Access token lifetime in seconds (default 3600).' },
  { name: 'MCP_OAUTH_REDIRECT_URIS', description: 'Comma-separated allowed redirect URIs.' },
  { name: 'MCP_CORS_ORIGINS', description: 'Extra comma-separated origins allowed for MCP routes.' },
];
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <div class="mb-8">
        <p class="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">Integrations</p>
        <h1 class="text-xl font-semibold text-text-primary mb-2">MCP Integration</h1>
        <p class="text-sm text-text-secondary max-w-[65ch]">
          Connect AI assistants and MCP clients to this workspace. Clients can browse workspaces,
          read endpoints and environments, and create or update endpoints, folders, and variables.
        </p>
      </div>

      <!-- Server endpoints -->
      <section class="rounded-lg border border-border-default bg-bg-secondary overflow-hidden mb-6">
        <div class="border-b border-border-default px-5 py-4">
          <h2 class="text-base font-semibold text-text-primary">Server endpoints</h2>
          <p class="text-sm text-text-secondary mt-1">
            Point your MCP client at one of these URLs. Streamable HTTP is preferred; SSE is provided
            for older clients.
          </p>
        </div>
        <div class="px-5 py-5 space-y-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-text-secondary mb-2">
              Streamable HTTP (recommended)
            </p>
            <div class="flex items-center gap-2">
              <code
                class="flex-1 min-w-0 truncate rounded-md border border-border-default bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary"
                >{{ mcpEndpoint }}</code
              >
              <button
                type="button"
                class="btn btn-secondary btn-sm shrink-0"
                @click="copyToClipboard(mcpEndpoint, 'Endpoint URL')"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-text-secondary mb-2">
              SSE (legacy clients)
            </p>
            <div class="flex items-center gap-2">
              <code
                class="flex-1 min-w-0 truncate rounded-md border border-border-default bg-bg-primary px-3 py-2 font-mono text-xs text-text-primary"
                >{{ sseEndpoint }}</code
              >
              <button
                type="button"
                class="btn btn-secondary btn-sm shrink-0"
                @click="copyToClipboard(sseEndpoint, 'SSE URL')"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Authentication -->
      <section class="rounded-lg border border-border-default bg-bg-secondary overflow-hidden mb-6">
        <div class="border-b border-border-default px-5 py-4">
          <h2 class="text-base font-semibold text-text-primary">Authentication</h2>
          <p class="text-sm text-text-secondary mt-1">
            Two modes are supported. OAuth-capable clients (Cursor, VS Code, MCP Inspector) discover
            the flow automatically via <code class="font-mono text-xs">.well-known</code> metadata.
          </p>
        </div>
        <div class="px-5 py-5 space-y-4">
          <div class="rounded-md border border-border-default bg-bg-primary p-4">
            <p class="text-sm font-medium text-text-primary mb-1">OAuth 2.0 + PKCE</p>
            <p class="text-xs text-text-secondary">
              Enabled when <code class="font-mono">MCP_OAUTH_CLIENT_ID</code> and
              <code class="font-mono">MCP_OAUTH_CLIENT_SECRET</code> are set. Just paste the endpoint
              URL into your client — it will ask you to sign in, open a consent page, and exchange
              an authorization code automatically. Mutating tools require the
              <code class="font-mono">mcp:write</code> scope.
            </p>
          </div>
          <div class="rounded-md border border-border-default bg-bg-primary p-4">
            <p class="text-sm font-medium text-text-primary mb-1">Bearer API key</p>
            <p class="text-xs text-text-secondary">
              Set <code class="font-mono">MCP_API_KEY</code> on the server, then send it as
              <code class="font-mono">Authorization: Bearer &lt;key&gt;</code> or
              <code class="font-mono">X-API-Key: &lt;key&gt;</code>. API-key clients get full tool
              access. If neither mode is configured, all MCP requests are denied — there is no
              unauthenticated mode.
            </p>
          </div>
          <div class="rounded-md border border-border-default bg-bg-primary p-4">
            <p class="text-sm font-medium text-text-primary mb-1">Account scoping</p>
            <p class="text-xs text-text-secondary">
              OAuth tokens are bound to the account that approves consent — tools can only read and
              mutate workspaces/collections that account can already reach, with the same
              owner/edit/view rules as the app. There are no delete tools. For the static API key,
              set <code class="font-mono">MCP_API_KEY_USER</code> to an account email to scope it the
              same way; without it the key is a service account with full access.
            </p>
          </div>
        </div>
      </section>

      <!-- Client setup -->
      <section class="rounded-lg border border-border-default bg-bg-secondary overflow-hidden mb-6">
        <div class="border-b border-border-default px-5 py-4">
          <h2 class="text-base font-semibold text-text-primary">Client setup</h2>
          <p class="text-sm text-text-secondary mt-1">
            Claude Desktop, Cursor, and other stdio-based clients connect through the
            <code class="font-mono text-xs">mcp-remote</code> bridge.
          </p>
        </div>
        <div class="px-5 py-5 space-y-5">
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">
                MCP client config (OAuth)
              </p>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="copyToClipboard(clientConfigJson, 'Client config')"
              >
                Copy
              </button>
            </div>
            <pre
              class="rounded-md border border-border-default bg-bg-primary p-3 font-mono text-xs text-text-primary overflow-x-auto"
            ><code>{{ clientConfigJson }}</code></pre>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">
                With bearer API key
              </p>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="copyToClipboard(clientConfigWithKeyJson, 'Client config')"
              >
                Copy
              </button>
            </div>
            <pre
              class="rounded-md border border-border-default bg-bg-primary p-3 font-mono text-xs text-text-primary overflow-x-auto"
            ><code>{{ clientConfigWithKeyJson }}</code></pre>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">
                Test with MCP Inspector
              </p>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="copyToClipboard(inspectorCommand, 'Inspector command')"
              >
                Copy
              </button>
            </div>
            <pre
              class="rounded-md border border-border-default bg-bg-primary p-3 font-mono text-xs text-text-primary overflow-x-auto"
            ><code>{{ inspectorCommand }}</code></pre>
          </div>
        </div>
      </section>

      <!-- Available tools -->
      <section class="rounded-lg border border-border-default bg-bg-secondary overflow-hidden mb-6">
        <div class="border-b border-border-default px-5 py-4">
          <h2 class="text-base font-semibold text-text-primary">Available tools</h2>
          <p class="text-sm text-text-secondary mt-1">
            Read tools require the <code class="font-mono text-xs">mcp:read</code> scope; mutating
            tools require <code class="font-mono text-xs">mcp:write</code> for OAuth clients.
          </p>
        </div>
        <div class="grid gap-px bg-border-default sm:grid-cols-2">
          <div class="bg-bg-secondary px-5 py-4">
            <p class="text-xs font-medium uppercase tracking-wide text-text-muted mb-3">
              Read · mcp:read
            </p>
            <ul class="space-y-2.5">
              <li v-for="tool in readTools" :key="tool.name">
                <code class="font-mono text-xs text-accent-blue">{{ tool.name }}</code>
                <p class="text-xs text-text-muted mt-0.5">{{ tool.description }}</p>
              </li>
            </ul>
          </div>
          <div class="bg-bg-secondary px-5 py-4">
            <p class="text-xs font-medium uppercase tracking-wide text-text-muted mb-3">
              Write · mcp:write
            </p>
            <ul class="space-y-2.5">
              <li v-for="tool in writeTools" :key="tool.name">
                <code class="font-mono text-xs text-accent-orange">{{ tool.name }}</code>
                <p class="text-xs text-text-muted mt-0.5">{{ tool.description }}</p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Server configuration -->
      <section class="rounded-lg border border-border-default bg-bg-secondary overflow-hidden">
        <div class="border-b border-border-default px-5 py-4">
          <h2 class="text-base font-semibold text-text-primary">Server configuration</h2>
          <p class="text-sm text-text-secondary mt-1">
            Environment variables that control the MCP server. Set them in the deployment
            environment — see <code class="font-mono text-xs">.env.example</code>.
          </p>
        </div>
        <div class="px-5 py-4">
          <dl class="divide-y divide-border-default">
            <div
              v-for="envVar in envVars"
              :key="envVar.name"
              class="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4"
            >
              <dt class="font-mono text-xs text-text-primary sm:w-64 shrink-0">{{ envVar.name }}</dt>
              <dd class="text-xs text-text-muted">{{ envVar.description }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  </div>
</template>
