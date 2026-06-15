<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';

interface OverviewStats {
  totalEvents: number;
  eventsLast7Days: number;
  eventsLast30Days: number;
  eventsLast90Days: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  activeUsersLast90Days: number;
  requestExecutions: number;
  successRate: number | null;
  avgResponseTimeMs: number | null;
  topUsers: Array<{
    userId: string;
    userEmail: string;
    eventCount: number;
  }>;
  topWorkspaces: Array<{
    workspaceId: string;
    workspaceName: string;
    eventCount: number;
  }>;
  eventsByType: Record<string, number>;
}

interface UserStat {
  userId: string;
  userEmail: string;
  totalEvents: number;
  requestExecutions: number;
  requestCreates: number;
  requestUpdates: number;
  requestDeletes: number;
  collectionCreates: number;
  collectionUpdates: number;
  collectionDeletes: number;
  folderCreates: number;
  folderDeletes: number;
  mockCreates: number;
  mockUpdates: number;
  mockDeletes: number;
  environmentCreates: number;
  environmentUpdates: number;
  environmentDeletes: number;
  lastActive: string | null;
  avgResponseTimeMs: number | null;
  successRate: number | null;
}

interface WorkspaceStat {
  workspaceId: string;
  workspaceName: string;
  totalEvents: number;
  activeUsers: number;
  requestExecutions: number;
  resourceCreates: number;
  resourceUpdates: number;
  resourceDeletes: number;
  lastActive: string | null;
  avgResponseTimeMs: number | null;
  successRate: number | null;
}

interface UsageEvent {
  id: string;
  userId: string;
  userEmail: string;
  workspaceId: string;
  eventType: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  method: string | null;
  url: string | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  success: boolean | null;
  metadata: string | null;
  timestamp: string;
}

interface TrendData {
  date: string;
  totalEvents: number;
  requestExecutions: number;
  resourceCreates: number;
  resourceUpdates: number;
  resourceDeletes: number;
  avgResponseTimeMs: number | null;
  successRate: number | null;
  activeUsers: number;
}

const activeTab = ref<'overview' | 'users' | 'workspaces' | 'events'>('overview');
const isLoading = ref(false);
const error = ref<string | null>(null);

// Overview data
const overviewStats = ref<OverviewStats | null>(null);

// Users data
const usersStats = ref<UserStat[]>([]);
const usersTotal = ref(0);
const usersOffset = ref(0);
const usersLimit = ref(50);

// Workspaces data
const workspacesStats = ref<WorkspaceStat[]>([]);

// Events data
const eventsList = ref<UsageEvent[]>([]);
const eventsTotal = ref(0);
const eventsOffset = ref(0);
const eventsLimit = ref(100);
const eventFilters = ref({
  startDate: '',
  endDate: '',
  userId: '',
  workspaceId: '',
  eventType: '',
  resourceType: '',
});

// Trends data
const trendsData = ref<TrendData[]>([]);

// Date range for overview
const dateRange = ref<'7d' | '30d' | '90d'>('30d');

const getStartDate = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
};

const fetchOverview = async () => {
  try {
    const days = dateRange.value === '7d' ? 7 : dateRange.value === '30d' ? 30 : 90;
    const response = await $fetch<OverviewStats>('/api/admin/super/usage/overview', {
      query: {
        startDate: getStartDate(days),
        endDate: new Date().toISOString(),
      },
    });
    overviewStats.value = response;
  } catch (e: any) {
    console.error('Error fetching overview:', e);
  }
};

const fetchUsers = async () => {
  try {
    const days = dateRange.value === '7d' ? 7 : dateRange.value === '30d' ? 30 : 90;
    const response = await $fetch<{ users: UserStat[]; total: number; limit: number; offset: number }>('/api/admin/super/usage/users', {
      query: {
        startDate: getStartDate(days),
        endDate: new Date().toISOString(),
        limit: usersLimit.value,
        offset: usersOffset.value,
      },
    });
    usersStats.value = response.users;
    usersTotal.value = response.total;
  } catch (e: any) {
    console.error('Error fetching users:', e);
  }
};

const fetchWorkspaces = async () => {
  try {
    const days = dateRange.value === '7d' ? 7 : dateRange.value === '30d' ? 30 : 90;
    const response = await $fetch<{ workspaces: WorkspaceStat[]; total: number }>('/api/admin/super/usage/workspaces', {
      query: {
        startDate: getStartDate(days),
        endDate: new Date().toISOString(),
      },
    });
    workspacesStats.value = response.workspaces;
  } catch (e: any) {
    console.error('Error fetching workspaces:', e);
  }
};

const fetchEvents = async () => {
  try {
    const query: Record<string, any> = {
      limit: eventsLimit.value,
      offset: eventsOffset.value,
    };
    
    if (eventFilters.value.startDate) query.startDate = eventFilters.value.startDate;
    if (eventFilters.value.endDate) query.endDate = eventFilters.value.endDate;
    if (eventFilters.value.userId) query.userId = eventFilters.value.userId;
    if (eventFilters.value.workspaceId) query.workspaceId = eventFilters.value.workspaceId;
    if (eventFilters.value.eventType) query.eventType = eventFilters.value.eventType;
    if (eventFilters.value.resourceType) query.resourceType = eventFilters.value.resourceType;
    
    const response = await $fetch<{ events: UsageEvent[]; total: number; filters: any }>('/api/admin/super/usage/events', {
      query,
    });
    eventsList.value = response.events;
    eventsTotal.value = response.total;
  } catch (e: any) {
    console.error('Error fetching events:', e);
  }
};

const fetchTrends = async () => {
  try {
    const days = dateRange.value === '7d' ? 7 : dateRange.value === '30d' ? 30 : 90;
    const response = await $fetch<{ trends: TrendData[] }>('/api/admin/super/usage/trends', {
      query: {
        startDate: getStartDate(days),
        endDate: new Date().toISOString(),
      },
    });
    trendsData.value = response.trends;
  } catch (e: any) {
    console.error('Error fetching trends:', e);
  }
};

const fetchAllData = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    await Promise.all([
      fetchOverview(),
      fetchUsers(),
      fetchWorkspaces(),
      fetchEvents(),
      fetchTrends(),
    ]);
  } catch (e: any) {
    error.value = e.message || 'Failed to fetch analytics data';
  } finally {
    isLoading.value = false;
  }
};

const refreshData = () => {
  fetchAllData();
};

// Watch for tab changes to refresh data
watch(activeTab, (newTab) => {
  if (newTab === 'users') fetchUsers();
  if (newTab === 'workspaces') fetchWorkspaces();
  if (newTab === 'events') fetchEvents();
});

// Watch for date range changes
watch(dateRange, () => {
  fetchAllData();
});

onMounted(() => {
  fetchAllData();
});

// Format helpers
const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString();
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTimeAgo = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatPercentage = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '-';
  return `${val}%`;
};

// Event type colors
const getEventTypeColor = (eventType: string): string => {
  if (eventType.includes('execute')) return 'bg-accent-blue/15 text-accent-blue';
  if (eventType.includes('create')) return 'bg-accent-green/15 text-accent-green';
  if (eventType.includes('update')) return 'bg-accent-yellow/15 text-accent-yellow';
  if (eventType.includes('delete')) return 'bg-accent-red/15 text-accent-red';
  return 'bg-bg-tertiary text-text-muted';
};

const getMethodColor = (method: string | null): string => getMethodColorClass(method, 'text-text-muted');

// Success/failure colors
const getSuccessColor = (success: boolean | null): string => {
  if (success === null) return 'text-text-muted';
  return success ? 'text-accent-green' : 'text-accent-red';
};

// Chart data computation
const chartData = computed(() => {
  return trendsData.value.map(d => ({
    date: d.date,
    events: d.totalEvents,
    requests: d.requestExecutions,
    creates: d.resourceCreates,
    updates: d.resourceUpdates,
    deletes: d.resourceDeletes,
  }));
});

// Safe max events calculation to avoid division by zero
const maxEvents = computed(() => {
  if (chartData.value.length === 0) return 1;
  const max = Math.max(...chartData.value.map(d => d.events));
  return max > 0 ? max : 1;
});

// Pagination helpers
const nextUsersPage = () => {
  if (usersOffset.value + usersLimit.value < usersTotal.value) {
    usersOffset.value += usersLimit.value;
    fetchUsers();
  }
};

const prevUsersPage = () => {
  if (usersOffset.value > 0) {
    usersOffset.value = Math.max(0, usersOffset.value - usersLimit.value);
    fetchUsers();
  }
};

const nextEventsPage = () => {
  if (eventsOffset.value + eventsLimit.value < eventsTotal.value) {
    eventsOffset.value += eventsLimit.value;
    fetchEvents();
  }
};

const prevEventsPage = () => {
  if (eventsOffset.value > 0) {
    eventsOffset.value = Math.max(0, eventsOffset.value - eventsLimit.value);
    fetchEvents();
  }
};

const applyEventFilters = () => {
  eventsOffset.value = 0;
  fetchEvents();
};

const clearEventFilters = () => {
  eventFilters.value = {
    startDate: '',
    endDate: '',
    userId: '',
    workspaceId: '',
    eventType: '',
    resourceType: '',
  };
  eventsOffset.value = 0;
  fetchEvents();
};
</script>

<template>
  <div class="h-full min-h-0 flex flex-col bg-bg-secondary">
    <!-- Header -->
    <header class="h-12 bg-bg-header border-b border-border-default flex items-center justify-between px-4 flex-shrink-0">
      <div class="flex items-center gap-4">
        <button
          @click="navigateTo('/admin/super-admin')"
          class="inline-flex items-center gap-1.5 py-1.5 px-2.5 text-text-secondary hover:text-text-primary transition-colors text-[13px] font-medium"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Dashboard
        </button>
        
        <div class="w-px h-6 bg-border-default"></div>
        
        <div class="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/>
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
          </svg>
          <span class="text-[15px] font-semibold text-text-primary">Usage Statistics</span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Date Range Selector -->
        <div class="flex items-center gap-1 bg-bg-tertiary rounded-md p-1 border border-border-default">
          <button
            @click="dateRange = '7d'"
            :class="[
              'px-3 py-1 text-[12px] font-medium rounded transition-colors',
              dateRange === '7d' ? 'bg-bg-input text-text-primary' : 'text-text-muted hover:text-text-secondary'
            ]"
          >
            7 Days
          </button>
          <button
            @click="dateRange = '30d'"
            :class="[
              'px-3 py-1 text-[12px] font-medium rounded transition-colors',
              dateRange === '30d' ? 'bg-bg-input text-text-primary' : 'text-text-muted hover:text-text-secondary'
            ]"
          >
            30 Days
          </button>
          <button
            @click="dateRange = '90d'"
            :class="[
              'px-3 py-1 text-[12px] font-medium rounded transition-colors',
              dateRange === '90d' ? 'bg-bg-input text-text-primary' : 'text-text-muted hover:text-text-secondary'
            ]"
          >
            90 Days
          </button>
        </div>

        <div class="w-px h-6 bg-border-default mx-1"></div>
        
        <button
          @click="refreshData"
          :disabled="isLoading"
          class="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-bg-tertiary text-text-secondary border border-border-default rounded-md cursor-pointer text-[13px] font-medium transition-all duration-fast hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
        >
          <svg 
            :class="['transition-transform', isLoading ? 'animate-spin' : '']" 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
          Refresh
        </button>
      </div>
    </header>

    <!-- Tabs -->
    <div class="px-4 pt-3 border-b border-border-default bg-bg-secondary">
      <nav class="flex gap-6">
        <button
          @click="activeTab = 'overview'"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors"
          :class="activeTab === 'overview'
            ? 'border-accent-blue text-accent-blue'
            : 'border-transparent text-text-secondary hover:text-text-primary'"
        >
          Overview
        </button>
        <button
          @click="activeTab = 'users'"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors"
          :class="activeTab === 'users'
            ? 'border-accent-blue text-accent-blue'
            : 'border-transparent text-text-secondary hover:text-text-primary'"
        >
          Users
        </button>
        <button
          @click="activeTab = 'workspaces'"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors"
          :class="activeTab === 'workspaces'
            ? 'border-accent-blue text-accent-blue'
            : 'border-transparent text-text-secondary hover:text-text-primary'"
        >
          Workspaces
        </button>
        <button
          @click="activeTab = 'events'"
          class="pb-3 text-[13px] font-medium border-b-2 transition-colors"
          :class="activeTab === 'events'
            ? 'border-accent-blue text-accent-blue'
            : 'border-transparent text-text-secondary hover:text-text-primary'"
        >
          Event Log
        </button>
      </nav>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Loading State -->
      <div v-if="isLoading" class="h-full flex items-center justify-center">
        <div class="flex flex-col items-center gap-3 text-text-muted">
          <svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
          <span class="text-[13px]">Loading analytics...</span>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="h-full flex items-center justify-center">
        <div class="text-center">
          <svg class="mx-auto mb-2 text-accent-red" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p class="text-accent-red text-[13px] mb-3">{{ error }}</p>
          <button @click="refreshData" class="px-4 py-2 bg-accent-blue text-white rounded-md text-[13px] font-medium hover:bg-accent-blue-hover transition-colors">
            Retry
          </button>
        </div>
      </div>

      <!-- Overview Tab -->
      <div v-else-if="activeTab === 'overview'" class="h-full overflow-y-auto p-6">
        <div v-if="overviewStats" class="max-w-7xl mx-auto space-y-6">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Total Events -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-accent-blue/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
                    <path d="M3 3v18h18"/>
                    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted uppercase tracking-wide">Total Events</p>
                  <p class="text-2xl font-bold text-text-primary">{{ formatNumber(overviewStats.totalEvents) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 text-[11px]">
                <span class="text-text-muted">Last 7 days:</span>
                <span class="font-medium text-text-primary">{{ formatNumber(overviewStats.eventsLast7Days) }}</span>
              </div>
            </div>

            <!-- Active Users -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-accent-green/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted uppercase tracking-wide">Active Users</p>
                  <p class="text-2xl font-bold text-text-primary">{{ formatNumber(overviewStats.activeUsersLast30Days) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 text-[11px]">
                <span class="text-text-muted">Last 7 days:</span>
                <span class="font-medium text-text-primary">{{ formatNumber(overviewStats.activeUsersLast7Days) }}</span>
              </div>
            </div>

            <!-- Request Executions -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-accent-orange/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted uppercase tracking-wide">Requests Executed</p>
                  <p class="text-2xl font-bold text-text-primary">{{ formatNumber(overviewStats.requestExecutions) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 text-[11px]">
                <span class="text-text-muted">Success rate:</span>
                <span class="font-medium" :class="overviewStats.successRate && overviewStats.successRate >= 90 ? 'text-accent-green' : 'text-accent-orange'">
                  {{ formatPercentage(overviewStats.successRate) }}
                </span>
              </div>
            </div>

            <!-- Avg Response Time -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-accent-purple/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[11px] text-text-muted uppercase tracking-wide">Avg Response Time</p>
                  <p class="text-2xl font-bold text-text-primary">{{ formatDuration(overviewStats.avgResponseTimeMs) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 text-[11px]">
                <span class="text-text-muted">Based on executed requests</span>
              </div>
            </div>
          </div>

          <!-- Charts Section -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Trends Chart -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <h3 class="text-[13px] font-semibold text-text-primary mb-4">Activity Trends</h3>
              <div class="h-64 relative">
                <div v-if="chartData.length > 0" class="h-full flex flex-col">
                  <div class="flex-1 flex gap-[2px] pl-10">
                    <!-- Y-axis labels -->
                    <div class="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-[10px] text-text-muted px-1 pb-0.5 pointer-events-none select-none">
                      <span>{{ formatNumber(maxEvents) }}</span>
                      <span>{{ formatNumber(Math.round(maxEvents / 2)) }}</span>
                      <span>0</span>
                    </div>
                    <!-- Bars -->
                    <div
                      v-for="(day, index) in chartData"
                      :key="day.date"
                      class="flex-1 relative group"
                    >
                      <div
                        class="absolute bottom-0 left-0 right-0 bg-accent-blue hover:bg-accent-blue-hover rounded-t transition-all duration-200"
                        :style="{
                          height: maxEvents > 0 ? `${(day.events / maxEvents) * 100}%` : '0%',
                          opacity: day.events > 0 ? 1 : 0.3
                        }"
                      >
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-bg-secondary border border-border-default px-2 py-1 rounded text-[10px] text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                          {{ formatNumber(day.events) }} events
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-[2px] pl-10">
                    <div
                      v-for="(day, index) in chartData"
                      :key="day.date + '-xlabel'"
                      class="flex-1 text-center"
                    >
                      <span v-if="index % 5 === 0 || index === chartData.length - 1" class="text-[9px] text-text-muted leading-none">
                        {{ day.date.slice(5) }}
                      </span>
                    </div>
                  </div>
                </div>
                <!-- Empty State -->
                <div v-else class="absolute inset-0 flex items-center justify-center">
                  <div class="text-center text-text-muted">
                    <svg class="mx-auto mb-2" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M3 3v18h18"/>
                      <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
                    </svg>
                    <p class="text-[12px]">No activity data available</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Events by Type -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <h3 class="text-[13px] font-semibold text-text-primary mb-4">Events by Type</h3>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                <div 
                  v-for="[type, count] in Object.entries(overviewStats.eventsByType).sort((a, b) => b[1] - a[1]).slice(0, 10)" 
                  :key="type"
                  class="flex items-center gap-3"
                >
                  <span class="text-[11px] font-medium px-2 py-1 rounded" :class="getEventTypeColor(type)">
                    {{ type.replace(/_/g, ' ') }}
                  </span>
                  <div class="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div 
                      class="h-full bg-accent-blue rounded-full"
                      :style="{ width: `${(count / Math.max(...Object.values(overviewStats.eventsByType))) * 100}%` }"
                    ></div>
                  </div>
                  <span class="text-[11px] text-text-muted w-12 text-right">{{ formatNumber(count) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Users & Workspaces -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Top Users -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <h3 class="text-[13px] font-semibold text-text-primary mb-4">Top Users</h3>
              <div class="space-y-2">
                <div 
                  v-for="(user, index) in overviewStats.topUsers.slice(0, 5)" 
                  :key="user.userId"
                  class="flex items-center gap-3 p-2 rounded hover:bg-bg-hover transition-colors"
                >
                  <span class="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] font-semibold text-text-muted">
                    {{ index + 1 }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] text-text-primary truncate">{{ user.userEmail }}</p>
                    <p class="text-[10px] text-text-muted">{{ formatNumber(user.eventCount) }} events</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Top Workspaces -->
            <div class="bg-bg-sidebar border border-border-default rounded-lg p-4">
              <h3 class="text-[13px] font-semibold text-text-primary mb-4">Top Workspaces</h3>
              <div class="space-y-2">
                <div 
                  v-for="(ws, index) in overviewStats.topWorkspaces.slice(0, 5)" 
                  :key="ws.workspaceId"
                  class="flex items-center gap-3 p-2 rounded hover:bg-bg-hover transition-colors"
                >
                  <span class="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] font-semibold text-text-muted">
                    {{ index + 1 }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] text-text-primary truncate">{{ ws.workspaceName }}</p>
                    <p class="text-[10px] text-text-muted">{{ formatNumber(ws.eventCount) }} events</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Users Tab -->
      <div v-else-if="activeTab === 'users'" class="h-full overflow-hidden flex flex-col">
        <div class="flex-1 overflow-y-auto p-6">
          <div class="max-w-7xl mx-auto">
            <div class="bg-bg-sidebar border border-border-default rounded-lg overflow-hidden">
              <table class="w-full">
                <thead class="bg-bg-tertiary border-b border-border-default">
                  <tr>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">User</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Total Events</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Requests</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Creates</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Updates</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Deletes</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Last Active</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-default">
                  <tr v-for="user in usersStats" :key="user.userId" class="hover:bg-bg-hover transition-colors">
                    <td class="px-4 py-3">
                      <p class="text-[13px] text-text-primary">{{ user.userEmail }}</p>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[13px] font-medium text-text-primary">{{ formatNumber(user.totalEvents) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[13px] text-text-secondary">{{ formatNumber(user.requestExecutions) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[13px] text-text-secondary">{{ formatNumber(user.requestCreates + user.collectionCreates + user.folderCreates + user.mockCreates + user.environmentCreates) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[13px] text-text-secondary">{{ formatNumber(user.requestUpdates + user.collectionUpdates + user.mockUpdates + user.environmentUpdates) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[13px] text-text-secondary">{{ formatNumber(user.requestDeletes + user.collectionDeletes + user.folderDeletes + user.mockDeletes + user.environmentDeletes) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[12px] text-text-muted">{{ formatTimeAgo(user.lastActive) }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div class="flex items-center justify-between mt-4">
              <p class="text-[12px] text-text-muted">
                Showing {{ formatNumber(usersOffset + 1) }} - {{ formatNumber(Math.min(usersOffset + usersLimit, usersTotal)) }} of {{ formatNumber(usersTotal) }} users
              </p>
              <div class="flex items-center gap-2">
                <button
                  @click="prevUsersPage"
                  :disabled="usersOffset === 0"
                  class="px-3 py-1.5 text-[12px] font-medium rounded border border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  @click="nextUsersPage"
                  :disabled="usersOffset + usersLimit >= usersTotal"
                  class="px-3 py-1.5 text-[12px] font-medium rounded border border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Workspaces Tab -->
      <div v-else-if="activeTab === 'workspaces'" class="h-full overflow-y-auto p-6">
        <div class="max-w-7xl mx-auto">
          <div class="bg-bg-sidebar border border-border-default rounded-lg overflow-hidden">
            <table class="w-full">
              <thead class="bg-bg-tertiary border-b border-border-default">
                <tr>
                  <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Workspace</th>
                  <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Total Events</th>
                  <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Active Users</th>
                  <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Requests</th>
                  <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Creates</th>
                  <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Last Active</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-default">
                <tr v-for="ws in workspacesStats" :key="ws.workspaceId" class="hover:bg-bg-hover transition-colors">
                  <td class="px-4 py-3">
                    <p class="text-[13px] text-text-primary">{{ ws.workspaceName }}</p>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[13px] font-medium text-text-primary">{{ formatNumber(ws.totalEvents) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[13px] text-text-secondary">{{ formatNumber(ws.activeUsers) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[13px] text-text-secondary">{{ formatNumber(ws.requestExecutions) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[13px] text-text-secondary">{{ formatNumber(ws.resourceCreates) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[12px] text-text-muted">{{ formatTimeAgo(ws.lastActive) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Events Tab -->
      <div v-else-if="activeTab === 'events'" class="h-full overflow-hidden flex flex-col">
        <!-- Filters -->
        <div class="px-6 py-3 bg-bg-sidebar border-b border-border-default">
          <div class="flex items-center gap-3 flex-wrap">
            <select
              v-model="eventFilters.eventType"
              class="px-3 py-1.5 text-[12px] bg-bg-input border border-border-default rounded text-text-primary focus:outline-none focus:border-accent-blue"
            >
              <option value="">All Event Types</option>
              <option value="request_execute">Request Execute</option>
              <option value="request_create">Request Create</option>
              <option value="request_update">Request Update</option>
              <option value="request_delete">Request Delete</option>
              <option value="collection_create">Collection Create</option>
              <option value="collection_update">Collection Update</option>
              <option value="collection_delete">Collection Delete</option>
              <option value="mock_create">Mock Create</option>
              <option value="mock_update">Mock Update</option>
              <option value="mock_delete">Mock Delete</option>
              <option value="environment_create">Environment Create</option>
              <option value="environment_update">Environment Update</option>
              <option value="environment_delete">Environment Delete</option>
            </select>

            <select
              v-model="eventFilters.resourceType"
              class="px-3 py-1.5 text-[12px] bg-bg-input border border-border-default rounded text-text-primary focus:outline-none focus:border-accent-blue"
            >
              <option value="">All Resources</option>
              <option value="request">Request</option>
              <option value="collection">Collection</option>
              <option value="folder">Folder</option>
              <option value="mock">Mock</option>
              <option value="environment">Environment</option>
            </select>

            <button
              @click="applyEventFilters"
              class="px-3 py-1.5 text-[12px] font-medium bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors"
            >
              Apply Filters
            </button>
            <button
              @click="clearEventFilters"
              class="px-3 py-1.5 text-[12px] font-medium bg-bg-tertiary text-text-secondary border border-border-default rounded hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <!-- Events Table -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="max-w-7xl mx-auto">
            <div class="bg-bg-sidebar border border-border-default rounded-lg overflow-hidden">
              <table class="w-full">
                <thead class="bg-bg-tertiary border-b border-border-default">
                  <tr>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Time</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">User</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Event Type</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Resource</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Details</th>
                    <th class="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-default">
                  <tr v-for="event in eventsList" :key="event.id" class="hover:bg-bg-hover transition-colors">
                    <td class="px-4 py-3">
                      <span class="text-[12px] text-text-muted">{{ formatTimeAgo(event.timestamp) }}</span>
                    </td>
                    <td class="px-4 py-3">
                      <p class="text-[12px] text-text-primary truncate max-w-[150px]">{{ event.userEmail }}</p>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-[11px] font-medium px-2 py-0.5 rounded" :class="getEventTypeColor(event.eventType)">
                        {{ event.eventType.replace(/_/g, ' ') }}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <p class="text-[12px] text-text-primary">{{ event.resourceName || event.resourceId || '-' }}</p>
                    </td>
                    <td class="px-4 py-3">
                      <div v-if="event.method" class="flex items-center gap-2">
                        <span class="text-[11px] font-semibold" :class="getMethodColor(event.method)">{{ event.method }}</span>
                        <span class="text-[11px] text-text-muted truncate max-w-[150px]">{{ event.url }}</span>
                      </div>
                      <span v-else class="text-[12px] text-text-muted">-</span>
                    </td>
                    <td class="px-4 py-3">
                      <div v-if="event.success !== null" class="flex items-center gap-2">
                        <svg 
                          width="14" 
                          height="14" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          stroke-width="2"
                          :class="getSuccessColor(event.success)"
                        >
                          <path v-if="event.success" d="M20 6L9 17l-5-5"/>
                          <path v-else d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                        <span v-if="event.statusCode" class="text-[11px] font-medium">{{ event.statusCode }}</span>
                        <span v-if="event.responseTimeMs" class="text-[11px] text-text-muted">{{ formatDuration(event.responseTimeMs) }}</span>
                      </div>
                      <span v-else class="text-[12px] text-text-muted">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div class="flex items-center justify-between mt-4">
              <p class="text-[12px] text-text-muted">
                Showing {{ formatNumber(eventsOffset + 1) }} - {{ formatNumber(Math.min(eventsOffset + eventsLimit, eventsTotal)) }} of {{ formatNumber(eventsTotal) }} events
              </p>
              <div class="flex items-center gap-2">
                <button
                  @click="prevEventsPage"
                  :disabled="eventsOffset === 0"
                  class="px-3 py-1.5 text-[12px] font-medium rounded border border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  @click="nextEventsPage"
                  :disabled="eventsOffset + eventsLimit >= eventsTotal"
                  class="px-3 py-1.5 text-[12px] font-medium rounded border border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>