<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="bg-bg-secondary p-3 rounded-lg border border-border-default">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <label class="text-[11px] font-medium text-text-secondary uppercase">From:</label>
          <input
            v-model="filters.startDate"
            type="date"
            class="px-2 py-1 text-[12px] bg-bg-tertiary border border-border-default rounded focus:ring-1 focus:ring-accent-orange focus:border-accent-orange text-text-primary"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-[11px] font-medium text-text-secondary uppercase">To:</label>
          <input
            v-model="filters.endDate"
            type="date"
            class="px-2 py-1 text-[12px] bg-bg-tertiary border border-border-default rounded focus:ring-1 focus:ring-accent-orange focus:border-accent-orange text-text-primary"
          />
        </div>
        
        <!-- Status Filter (Multi-Select) -->
        <div class="flex items-center gap-2">
          <label class="text-[11px] font-medium text-text-secondary uppercase">Status:</label>
          <div class="relative status-dropdown-container">
            <button
              @click.stop="toggleStatusDropdown"
              class="px-2 py-1 text-[12px] bg-bg-tertiary border border-border-default rounded min-w-[140px] text-left flex items-center justify-between gap-2 hover:bg-bg-hover transition-colors"
            >
              <span class="truncate">{{ selectedStatusLabels }}</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="2"
                :class="['transition-transform', showStatusDropdown ? 'rotate-180' : '']"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            
            <!-- Status Dropdown -->
            <div
              v-if="showStatusDropdown"
              class="absolute top-full left-0 mt-1 min-w-[180px] bg-bg-secondary border border-border-default rounded-lg shadow-lg py-2 z-50"
            >
              <div class="px-3 py-1.5 text-[11px] text-text-muted border-b border-border-default">
                Select multiple
              </div>
              <div class="max-h-[200px] overflow-y-auto">
                <label
                  v-for="status in availableStatuses"
                  :key="status"
                  class="flex items-center gap-2 px-3 py-2 hover:bg-bg-hover cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    :value="status"
                    v-model="selectedStatuses"
                    class="w-3.5 h-3.5 rounded border-border-default text-accent-orange focus:ring-accent-orange"
                  />
                  <span 
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                    :class="[statusColors[status].bg, statusColors[status].text]"
                  >
                    {{ status }}
                  </span>
                </label>
              </div>
              <div class="px-3 py-2 border-t border-border-default flex justify-between">
                <button
                  @click="selectedStatuses = []"
                  class="text-[11px] text-text-muted hover:text-text-primary"
                >
                  Clear
                </button>
                <button
                  @click="selectAllStatuses"
                  class="text-[11px] text-accent-orange hover:text-accent-orange-hover"
                >
                  Select All
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <button
          @click="applyFilters"
          class="inline-flex items-center gap-1 px-3 py-1.5 bg-accent-orange text-white rounded text-[11px] font-medium hover:bg-accent-orange-hover transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Apply
        </button>
        <button
          @click="exportData"
          class="inline-flex items-center gap-1 px-3 py-1.5 text-accent-orange border border-accent-orange rounded text-[11px] font-medium hover:bg-accent-orange/10 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="w-6 h-6 border-2 border-border-default border-t-accent-orange rounded-full animate-spin" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
      <p class="text-[12px] text-accent-red">{{ error }}</p>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div class="bg-bg-secondary p-3 rounded-lg border border-border-default">
          <div class="flex items-center gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p class="text-[11px] text-text-muted uppercase">Total Submissions</p>
          </div>
          <p class="text-xl font-bold text-text-primary">{{ analytics?.totalSubmissions || 0 }}</p>
        </div>
        
        <div class="bg-bg-secondary p-3 rounded-lg border border-border-default">
          <div class="flex items-center gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <p class="text-[11px] text-text-muted uppercase">Average Rating</p>
          </div>
          <p class="text-xl font-bold text-text-primary">
            {{ analytics?.averageRating ? analytics.averageRating.toFixed(1) : 'N/A' }}
          </p>
        </div>
        
        <div class="bg-bg-secondary p-3 rounded-lg border border-border-default">
          <div class="flex items-center gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <p class="text-[11px] text-text-muted uppercase">This Week</p>
          </div>
          <p class="text-xl font-bold text-text-primary">{{ submissionsThisWeek }}</p>
        </div>
        
        <div class="bg-bg-secondary p-3 rounded-lg border border-border-default">
          <div class="flex items-center gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p class="text-[11px] text-text-muted uppercase">Response Rate</p>
          </div>
          <p class="text-xl font-bold text-text-primary">{{ responseRate }}%</p>
        </div>

        <!-- Open Tickets Card -->
        <div class="bg-bg-secondary p-3 rounded-lg border border-border-default">
          <div class="flex items-center gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-500">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <p class="text-[11px] text-text-muted uppercase">Open Tickets</p>
          </div>
          <p class="text-xl font-bold text-amber-500">{{ openTicketsCount }}</p>
        </div>
      </div>

      <!-- Status Distribution -->
      <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
        <h3 class="text-[13px] font-medium text-text-primary mb-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Status Distribution
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div
            v-for="stat in analytics?.submissionsByStatus || []"
            :key="stat.status"
            class="p-3 rounded-lg border border-border-default hover:bg-bg-hover cursor-pointer transition-colors"
            :class="{ 'bg-bg-hover ring-1 ring-accent-orange': selectedStatuses.includes(stat.status) }"
            @click="toggleStatus(stat.status)"
          >
            <div class="flex items-center justify-between mb-1">
              <span 
                class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                :class="[statusColors[stat.status].bg, statusColors[stat.status].text]"
              >
                {{ stat.status }}
              </span>
              <span class="text-[12px] font-semibold text-text-primary">{{ stat.count }}</span>
            </div>
            <div class="text-[10px] text-text-muted">
              {{ ((stat.count / (analytics?.totalSubmissions || 1)) * 100).toFixed(0) }}%
            </div>
          </div>
          <div v-if="!analytics?.submissionsByStatus?.length" class="col-span-full text-center py-4 text-text-muted text-[12px]">
            No status data available
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Rating Distribution -->
        <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
          <h3 class="text-[13px] font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Rating Distribution
          </h3>
          <div v-if="hasRatings" class="space-y-1.5">
            <div v-for="rating in [5, 4, 3, 2, 1]" :key="rating" class="flex items-center gap-2">
              <span class="w-6 text-[11px] font-medium text-text-muted">{{ rating }}★</span>
              <div class="flex-1 h-4 bg-bg-tertiary rounded-sm overflow-hidden">
                <div
                  class="h-full bg-accent-orange rounded-sm transition-all duration-500"
                  :style="{ width: getRatingPercentage(rating) + '%' }"
                />
              </div>
              <span class="w-8 text-[11px] text-text-muted text-right">
                {{ analytics?.ratingDistribution[rating] || 0 }}
              </span>
            </div>
          </div>
          <div v-else class="flex flex-col items-center justify-center py-8 text-text-muted">
            <svg class="mb-2 opacity-50" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <p class="text-[12px]">No ratings data available</p>
          </div>
        </div>

        <!-- Submissions Over Time -->
        <div class="bg-bg-secondary p-4 rounded-lg border border-border-default">
          <h3 class="text-[13px] font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Submissions Over Time
          </h3>
          <div v-if="analytics?.submissionsByDay?.length" class="h-40 flex items-end gap-0.5">
            <div
              v-for="day in analytics.submissionsByDay"
              :key="day.date"
              class="flex-1 flex flex-col items-center gap-1"
            >
              <div
                class="w-full bg-accent-orange/80 rounded-t-sm transition-all duration-500 hover:bg-accent-orange"
                :style="{ height: getDayHeight(day.count) + 'px' }"
                :title="`${day.date}: ${day.count} submissions`"
              />
              <span class="text-[9px] text-text-muted">
                {{ formatDateShort(day.date) }}
              </span>
            </div>
          </div>
          <div v-else class="flex flex-col items-center justify-center py-8 text-text-muted">
            <svg class="mb-2 opacity-50" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <p class="text-[12px]">No data available</p>
          </div>
        </div>
      </div>

      <!-- Submissions by Workspace -->
      <div class="bg-bg-secondary rounded-lg border border-border-default overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border-default flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <h3 class="text-[13px] font-medium text-text-primary">Submissions by Workspace</h3>
        </div>
        <div class="divide-y divide-border-default">
          <div
            v-for="ws in analytics?.submissionsByWorkspace"
            :key="ws.workspaceId || 'unknown'"
            class="px-4 py-2 flex items-center justify-between hover:bg-bg-hover"
          >
            <span class="text-[12px] text-text-primary truncate">
              {{ ws.workspaceId || 'Unknown/No Workspace' }}
            </span>
            <span class="px-2 py-0.5 bg-accent-orange/10 text-accent-orange text-[11px] font-medium rounded">
              {{ ws.count }}
            </span>
          </div>
          <div v-if="!analytics?.submissionsByWorkspace?.length" class="px-4 py-6 text-center text-text-muted">
            <p class="text-[12px]">No workspace data available</p>
          </div>
        </div>
      </div>

      <!-- Recent Submissions -->
      <div class="bg-bg-secondary rounded-lg border border-border-default overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border-default flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <h3 class="text-[13px] font-medium text-text-primary">Recent Submissions</h3>
          </div>
          <span class="text-[11px] text-text-muted">{{ submissions.length }} total</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-bg-header">
              <tr>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Date</th>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">User</th>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Rating</th>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Status</th>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Comment</th>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Comments</th>
                <th class="px-4 py-2 text-left text-[10px] font-medium text-text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-default">
              <tr v-for="submission in paginatedSubmissions" :key="submission.id" class="hover:bg-bg-hover">
                <td class="px-4 py-2 whitespace-nowrap text-[11px] text-text-secondary">
                  {{ formatDate(submission.createdAt) }}
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-[11px] text-text-primary">
                  {{ submission.userEmail || submission.userId || 'Anonymous' }}
                </td>
                <td class="px-4 py-2 whitespace-nowrap">
                  <span v-if="submission.rating" class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-yellow/10 text-accent-yellow">
                    {{ submission.rating }} ★
                  </span>
                  <span v-else class="text-text-muted">-</span>
                </td>
                <td class="px-4 py-2 whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <span 
                      class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize"
                      :class="[statusColors[submission.status].bg, statusColors[submission.status].text]"
                    >
                      {{ submission.status }}
                    </span>
                    <!-- Quick Status Change Dropdown -->
                    <div class="relative quick-status-dropdown">
                      <button
                        @click.stop="toggleQuickStatus(submission.id, $event)"
                        class="p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
                        title="Change status"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2 text-[11px] text-text-secondary max-w-xs truncate">
                  {{ submission.comment || '-' }}
                </td>
                <td class="px-4 py-2 whitespace-nowrap">
                  <span
                    v-if="submission.comments.length"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-blue/10 text-accent-blue"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    {{ submission.comments.length }}
                  </span>
                  <span v-else class="text-text-muted">-</span>
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-[11px]">
                  <button
                    @click="viewDetails(submission)"
                    class="text-accent-orange hover:text-accent-orange-hover"
                  >
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Pagination -->
        <div v-if="totalPages > 1" class="px-4 py-2 border-t border-border-default flex items-center justify-between">
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="px-2 py-1 text-[11px] border border-border-default rounded hover:bg-bg-hover disabled:opacity-50 text-text-secondary"
          >
            Previous
          </button>
          <span class="text-[11px] text-text-muted">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            @click="currentPage++"
            :disabled="currentPage === totalPages"
            class="px-2 py-1 text-[11px] border border-border-default rounded hover:bg-bg-hover disabled:opacity-50 text-text-secondary"
          >
            Next
          </button>
        </div>
      </div>

      <!-- Quick Status Dropdown Portal -->
      <Teleport to="body">
        <div
          v-if="quickStatusOpen && quickStatusSubmission"
          ref="quickStatusDropdownRef"
          class="fixed z-[100]"
          :style="{ 
            left: quickStatusPosition.x + 'px', 
            top: quickStatusPosition.y + 'px'
          }"
        >
          <!-- Small arrow pointing to the button -->
          <div 
            class="absolute left-3 w-2 h-2 bg-bg-secondary border-l border-t border-border-default transform rotate-45 z-[101]"
            :class="quickStatusPosition.isAbove ? 'bottom-[-5px]' : 'top-[-5px]'"
          ></div>
          
          <div 
            class="bg-bg-secondary border border-border-default rounded-lg shadow-lg py-1 relative z-[102]"
            :style="{ 
              width: '140px',
              maxHeight: quickStatusPosition.maxHeight + 'px'
            }"
          >
            <div class="overflow-y-auto" :style="{ maxHeight: (quickStatusPosition.maxHeight - 10) + 'px' }">
              <button
                v-for="status in availableStatuses"
                :key="status"
                @click.stop="initiateStatusChange(quickStatusSubmission, status)"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover transition-colors shrink-0"
                :class="{ 'bg-bg-hover': quickStatusSubmission.status === status }"
              >
                <span 
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                  :class="[statusColors[status].bg, statusColors[status].text]"
                >
                  {{ status }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- Status Change Confirmation Dialog -->
    <Teleport to="body">
      <div
        v-if="confirmStatusChange.visible"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        @click.self="cancelStatusChange"
      >
        <div class="w-full max-w-sm bg-bg-secondary rounded-lg shadow-xl border border-border-default p-4">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-full bg-accent-orange/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-orange">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h3 class="text-[14px] font-medium text-text-primary">Confirm Status Change</h3>
          </div>
          
          <p class="text-[12px] text-text-secondary mb-4">
            Are you sure you want to change the status from 
            <span 
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize mx-1"
              :class="[statusColors[confirmStatusChange.from].bg, statusColors[confirmStatusChange.from].text]"
            >
              {{ confirmStatusChange.from }}
            </span> 
            to 
            <span 
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize mx-1"
              :class="[statusColors[confirmStatusChange.to].bg, statusColors[confirmStatusChange.to].text]"
            >
              {{ confirmStatusChange.to }}
            </span>?
          </p>
          
          <div v-if="confirmStatusChange.submission" class="mb-4 p-3 bg-bg-tertiary rounded border border-border-default">
            <div class="text-[11px] text-text-muted mb-1">Submission</div>
            <div class="text-[12px] text-text-primary truncate">
              {{ confirmStatusChange.submission.userEmail || confirmStatusChange.submission.userId || 'Anonymous' }}
            </div>
            <div class="text-[11px] text-text-muted">
              {{ formatDate(confirmStatusChange.submission.createdAt) }}
            </div>
          </div>
          
          <div class="flex justify-end gap-2">
            <button
              @click="cancelStatusChange"
              :disabled="confirmStatusChange.loading"
              class="px-3 py-1.5 text-[12px] border border-border-default rounded hover:bg-bg-hover text-text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              @click="confirmStatusChangeAction"
              :disabled="confirmStatusChange.loading"
              class="px-3 py-1.5 text-[12px] bg-accent-orange text-white rounded hover:bg-accent-orange-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <svg 
                v-if="confirmStatusChange.loading" 
                class="animate-spin" 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="2"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
              </svg>
              <span>{{ confirmStatusChange.loading ? 'Updating...' : 'Confirm Change' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Submission Detail Modal -->
    <Teleport to="body">
      <div
        v-if="selectedSubmission"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        @click.self="selectedSubmission = null"
      >
        <div class="w-full max-w-xl bg-bg-secondary rounded-lg shadow-xl overflow-hidden max-h-[80vh] overflow-y-auto border border-border-default">
          <div class="px-4 py-3 border-b border-border-default bg-bg-header flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-accent-orange">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <h3 class="text-[14px] font-medium text-text-primary">Submission Details</h3>
            </div>
            <button @click="selectedSubmission = null" class="text-text-muted hover:text-text-primary">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-4 space-y-4">
            <!-- Current Status Section -->
            <div class="p-3 bg-bg-tertiary rounded-lg border border-border-default">
              <div class="flex items-center justify-between mb-3">
                <label class="text-[11px] font-medium text-text-muted uppercase">Current Status</label>
                <span 
                  class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize"
                  :class="[statusColors[selectedSubmission.status].bg, statusColors[selectedSubmission.status].text]"
                >
                  {{ selectedSubmission.status }}
                </span>
              </div>
              
              <!-- Status Change Dropdown -->
              <div class="flex items-center gap-2">
                <span class="text-[12px] text-text-secondary">Change to:</span>
                <select
                  v-model="selectedNewStatus"
                  class="px-2 py-1.5 text-[12px] bg-bg-secondary border border-border-default rounded focus:ring-1 focus:ring-accent-orange focus:border-accent-orange text-text-primary"
                >
                  <option value="">Select status...</option>
                  <option 
                    v-for="status in availableStatuses.filter(s => s !== selectedSubmission?.status)" 
                    :key="status" 
                    :value="status"
                  >
                    {{ status.charAt(0).toUpperCase() + status.slice(1) }}
                  </option>
                </select>
                <button
                  v-if="selectedNewStatus"
                  @click="initiateStatusChangeFromModal"
                  class="px-3 py-1.5 text-[12px] bg-accent-orange text-white rounded hover:bg-accent-orange-hover transition-colors"
                >
                  Update
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="p-2 bg-bg-tertiary rounded border border-border-default">
                <label class="text-[10px] font-medium text-text-muted uppercase">Submitted</label>
                <p class="text-[12px] text-text-primary">{{ formatDateFull(selectedSubmission.createdAt) }}</p>
              </div>
              <div class="p-2 bg-bg-tertiary rounded border border-border-default">
                <label class="text-[10px] font-medium text-text-muted uppercase">User</label>
                <p class="text-[12px] text-text-primary">{{ selectedSubmission.userEmail || selectedSubmission.userId || 'Anonymous' }}</p>
              </div>
            </div>
            
            <div v-if="selectedSubmission.rating" class="p-2 bg-bg-tertiary rounded border border-border-default">
              <label class="text-[10px] font-medium text-text-muted uppercase">Rating</label>
              <p class="text-lg text-accent-yellow">{{ '★'.repeat(selectedSubmission.rating) }}</p>
            </div>
            
            <div v-if="selectedSubmission.comment" class="p-2 bg-bg-tertiary rounded border border-border-default">
              <label class="text-[10px] font-medium text-text-muted uppercase">Comment</label>
              <p class="text-[12px] text-text-primary whitespace-pre-wrap">{{ selectedSubmission.comment }}</p>
            </div>
            
            <div v-if="Object.keys(selectedSubmission.responses).length" class="p-2 bg-bg-tertiary rounded border border-border-default">
              <label class="text-[10px] font-medium text-text-muted uppercase">Responses</label>
              <div class="mt-1 space-y-1">
                <div
                  v-for="(value, key) in selectedSubmission.responses"
                  :key="key"
                  class="p-2 bg-bg-secondary rounded border border-border-default"
                >
                  <p class="text-[10px] font-medium text-text-muted">{{ key }}</p>
                  <p class="text-[12px] text-text-primary">
                    {{ Array.isArray(value) ? value.join(', ') : value }}
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Status History Section (Collapsible) -->
            <div class="border border-border-default rounded-lg overflow-hidden">
              <button
                @click="showHistory = !showHistory"
                class="w-full px-3 py-2.5 bg-bg-tertiary flex items-center justify-between hover:bg-bg-hover transition-colors"
              >
                <div class="flex items-center gap-2">
                  <svg 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    stroke-width="2" 
                    class="text-text-muted"
                    :class="{ 'rotate-90': showHistory }"
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span class="text-[12px] font-medium text-text-primary">Status History</span>
                  <span class="text-[11px] text-text-muted">({{ statusHistory.length }})</span>
                </div>
                <div v-if="loadingHistory" class="w-4 h-4 border-2 border-border-default border-t-accent-orange rounded-full animate-spin" />
              </button>
              
              <div v-show="showHistory" class="p-3 bg-bg-secondary">
                <div v-if="loadingHistory" class="py-4 text-center text-text-muted text-[12px]">
                  Loading history...
                </div>
                <div v-else-if="statusHistory.length === 0" class="py-4 text-center text-text-muted text-[12px]">
                  No status changes yet
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="record in statusHistory"
                    :key="record.id"
                    class="p-2.5 bg-bg-tertiary rounded border border-border-default"
                  >
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-[11px] text-text-muted">{{ formatDateFull(record.changedAt) }}</span>
                      <span class="text-[11px] text-text-secondary">by {{ record.changedBy }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span 
                        class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                        :class="[statusColors[record.fromStatus].bg, statusColors[record.fromStatus].text]"
                      >
                        {{ record.fromStatus }}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <span 
                        class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
                        :class="[statusColors[record.toStatus].bg, statusColors[record.toStatus].text]"
                      >
                        {{ record.toStatus }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Comments Section -->
            <div v-if="selectedSubmission.comments.length" class="border border-border-default rounded-lg overflow-hidden">
              <div class="px-3 py-2.5 bg-bg-tertiary flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="text-[12px] font-medium text-text-primary">Comments</span>
                <span class="text-[11px] text-text-muted">({{ selectedSubmission.comments.length }})</span>
              </div>
              <div class="p-3 bg-bg-secondary space-y-2">
                <div
                  v-for="comment in selectedSubmission.comments"
                  :key="comment.id"
                  class="p-2.5 bg-bg-tertiary rounded border border-border-default"
                >
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[11px] font-medium text-text-primary">{{ comment.userEmail || 'Anonymous' }}</span>
                    <span class="text-[10px] text-text-muted">{{ formatDateFull(comment.createdAt) }}</span>
                  </div>
                  <p class="text-[12px] text-text-secondary whitespace-pre-wrap">{{ comment.content }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';

type FeedbackStatus = 'open' | 'pending' | 'process' | 'resolved' | 'closed';

interface StatusHistoryRecord {
  id: string;
  submissionId: string;
  fromStatus: FeedbackStatus;
  toStatus: FeedbackStatus;
  changedBy: string;
  changedAt: string;
}

interface Comment {
  id: string;
  userId: string;
  userEmail: string | null;
  content: string;
  createdAt: string;
}

interface Submission {
  id: string;
  userId: string | null;
  userEmail: string | null;
  workspaceId: string | null;
  responses: Record<string, unknown>;
  rating: number | null;
  comment: string | null;
  status: FeedbackStatus;
  createdAt: string;
  userAgent: string | null;
  recentHistory?: StatusHistoryRecord[];
  comments: Comment[];
}

interface Analytics {
  totalSubmissions: number;
  averageRating: number | null;
  ratingDistribution: Record<number, number>;
  submissionsByDay: Array<{ date: string; count: number }>;
  submissionsByWorkspace: Array<{ workspaceId: string | null; count: number }>;
  submissionsByStatus: Array<{ status: FeedbackStatus; count: number }>;
}

// Status badge colors
const statusColors: Record<FeedbackStatus, { bg: string; text: string }> = {
  open: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
  pending: { bg: 'bg-orange-500/10', text: 'text-orange-500' },
  process: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  resolved: { bg: 'bg-green-500/10', text: 'text-green-500' },
  closed: { bg: 'bg-gray-500/10', text: 'text-gray-500' }
};

const filters = ref({
  startDate: '',
  endDate: ''
});

const submissions = ref<Submission[]>([]);
const analytics = ref<Analytics | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(1);
const itemsPerPage = 10;
const selectedSubmission = ref<Submission | null>(null);
const showHistory = ref(false);
const statusHistory = ref<StatusHistoryRecord[]>([]);
const loadingHistory = ref(false);
const selectedNewStatus = ref<FeedbackStatus | ''>('');

// Status filter
const showStatusDropdown = ref(false);
const availableStatuses: FeedbackStatus[] = ['open', 'pending', 'process', 'resolved', 'closed'];
const selectedStatuses = ref<FeedbackStatus[]>([]);

// Quick status change in table
const quickStatusOpen = ref<string | null>(null);
const quickStatusPosition = ref({ x: 0, y: 0, maxHeight: 200, isAbove: false });
const quickStatusDropdownRef = ref<HTMLElement | null>(null);
const quickStatusToggleRef = ref<HTMLElement | null>(null); // Store ref to active toggle button
const quickStatusSubmission = computed(() => {
  if (!quickStatusOpen.value) return null;
  return submissions.value.find(s => s.id === quickStatusOpen.value) || null;
});

// Confirmation dialog
const confirmStatusChange = ref<{
  visible: boolean;
  submission: Submission | null;
  from: FeedbackStatus | '';
  to: FeedbackStatus | '';
  loading: boolean;
}>({
  visible: false,
  submission: null,
  from: '',
  to: '',
  loading: false
});

const totalPages = computed(() => Math.ceil(submissions.value.length / itemsPerPage));

const paginatedSubmissions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return submissions.value.slice(start, start + itemsPerPage);
});

const hasRatings = computed(() => {
  return analytics.value?.ratingDistribution && Object.keys(analytics.value.ratingDistribution).length > 0;
});

const submissionsThisWeek = computed(() => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return submissions.value.filter(s => new Date(s.createdAt) >= weekAgo).length;
});

const responseRate = computed(() => {
  return Math.min(100, Math.round((analytics.value?.totalSubmissions || 0) * 2));
});

const openTicketsCount = computed(() => {
  return analytics.value?.submissionsByStatus?.find(s => s.status === 'open')?.count || 0;
});

const selectedStatusLabels = computed(() => {
  if (selectedStatuses.value.length === 0) return 'All Statuses';
  if (selectedStatuses.value.length === availableStatuses.length) return 'All Statuses';
  if (selectedStatuses.value.length === 1) {
    return selectedStatuses.value[0].charAt(0).toUpperCase() + selectedStatuses.value[0].slice(1);
  }
  return `${selectedStatuses.value.length} selected`;
});

const fetchData = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    const params: Record<string, string> = {};
    if (filters.value.startDate) params.startDate = filters.value.startDate;
    if (filters.value.endDate) params.endDate = filters.value.endDate;
    if (selectedStatuses.value.length > 0) params.status = selectedStatuses.value.join(',');
    
    const response = await $fetch<{
      submissions: Submission[];
      analytics: Analytics;
      availableStatuses: FeedbackStatus[];
    }>('/api/admin/super/feedback/submissions', { params });
    
    submissions.value = response.submissions;
    analytics.value = response.analytics;
    currentPage.value = 1;
  } catch (e: any) {
    console.error('Failed to fetch feedback data:', e);
    error.value = 'Failed to load feedback data';
  } finally {
    isLoading.value = false;
  }
};

const fetchStatusHistory = async (submissionId: string) => {
  loadingHistory.value = true;
  try {
    const response = await $fetch<{
      history: StatusHistoryRecord[];
    }>(`/api/admin/super/feedback/submissions/${submissionId}/history`);
    statusHistory.value = response.history;
  } catch (e) {
    console.error('Failed to fetch status history:', e);
    statusHistory.value = [];
  } finally {
    loadingHistory.value = false;
  }
};

const applyFilters = () => {
  fetchData();
};

const exportData = () => {
  const csv = [
    ['Date', 'User', 'Email', 'Workspace', 'Rating', 'Status', 'Comment', 'Responses'].join(','),
    ...submissions.value.map(s => [
      s.createdAt,
      s.userId || '',
      s.userEmail || '',
      s.workspaceId || '',
      s.rating || '',
      s.status,
      `"${(s.comment || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(s.responses).replace(/"/g, '""')}"`
    ].join(','))
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const getRatingPercentage = (rating: number): number => {
  if (!analytics.value?.totalSubmissions) return 0;
  const count = analytics.value.ratingDistribution[rating] || 0;
  return (count / analytics.value.totalSubmissions) * 100;
};

const maxDayCount = computed(() => {
  if (!analytics.value?.submissionsByDay?.length) return 1;
  return Math.max(...analytics.value.submissionsByDay.map(d => d.count));
});

const getDayHeight = (count: number): number => {
  if (maxDayCount.value === 0) return 0;
  return (count / maxDayCount.value) * 120;
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString();
};

const formatDateShort = (date: string): string => {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const formatDateFull = (date: string): string => {
  return new Date(date).toLocaleString();
};

const viewDetails = (submission: Submission) => {
  selectedSubmission.value = submission;
  showHistory.value = false;
  statusHistory.value = [];
  selectedNewStatus.value = '';
  
  // If we have recent history from the list, use it
  if (submission.recentHistory && submission.recentHistory.length > 0) {
    statusHistory.value = submission.recentHistory;
  }
};

// Status dropdown handlers
const toggleStatusDropdown = () => {
  showStatusDropdown.value = !showStatusDropdown.value;
  // Close quick status dropdown if open
  closeQuickStatusDropdown();
};

const toggleStatus = (status: FeedbackStatus) => {
  const index = selectedStatuses.value.indexOf(status);
  if (index > -1) {
    selectedStatuses.value.splice(index, 1);
  } else {
    selectedStatuses.value.push(status);
  }
};

const selectAllStatuses = () => {
  selectedStatuses.value = [...availableStatuses];
};

// Quick status change in table
// Compute dropdown position based on button rectangle
// Centralizes positioning logic to avoid duplication between initial open and scroll/resize updates
const computeQuickStatusPosition = (buttonRect: DOMRect) => {
  const itemHeight = 32; // Height per status item
  const padding = 16; // Total padding
  const naturalDropdownHeight = itemHeight * availableStatuses.length + padding;

  const viewportHeight = window.innerHeight;
  const margin = 8;
  const gap = 1; // Small gap between button and dropdown

  // Available space
  const spaceBelow = viewportHeight - buttonRect.bottom - margin;
  const spaceAbove = buttonRect.top - margin;

  // Determine position and height
  let dropdownY: number;
  let maxHeight: number;
  let isAbove = false;

  // Always prefer positioning below if there's enough room
  if (spaceBelow >= naturalDropdownHeight) {
    dropdownY = buttonRect.bottom + gap;
    maxHeight = naturalDropdownHeight;
    isAbove = false;
  } else if (spaceAbove >= naturalDropdownHeight) {
    dropdownY = buttonRect.top - naturalDropdownHeight - gap;
    maxHeight = naturalDropdownHeight;
    isAbove = true;
  } else if (spaceBelow >= spaceAbove) {
    // Not enough space either way, but more space below
    dropdownY = buttonRect.bottom + gap;
    maxHeight = Math.max(itemHeight * 2 + padding, spaceBelow);
    isAbove = false;
  } else {
    // Not enough space either way, but more space above
    maxHeight = Math.max(itemHeight * 2 + padding, spaceAbove);
    dropdownY = buttonRect.top - maxHeight - gap;
    isAbove = true;
  }

  // Ensure dropdown stays within viewport vertically
  if (dropdownY < margin) {
    dropdownY = margin;
  }
  if (dropdownY + maxHeight > viewportHeight - margin) {
    maxHeight = viewportHeight - margin - dropdownY;
  }

  // Horizontal constraint: ensure dropdown doesn't go off-screen
  const dropdownWidth = 140;
  let dropdownX = buttonRect.left;
  // Clamp X to stay within viewport with margin
  dropdownX = Math.min(dropdownX, window.innerWidth - dropdownWidth - margin);
  dropdownX = Math.max(dropdownX, margin);

  return {
    x: dropdownX,
    y: dropdownY,
    maxHeight: maxHeight,
    isAbove: isAbove
  };
};

// Toggle quick status dropdown
const toggleQuickStatus = (submissionId: string, event?: MouseEvent) => {
  if (quickStatusOpen.value === submissionId) {
    closeQuickStatusDropdown();
    return;
  }

  // Close any existing dropdown first and clean up
  if (quickStatusOpen.value) {
    removeQuickStatusListeners();
  }

  quickStatusOpen.value = submissionId;

  if (event) {
    const button = event.currentTarget as HTMLElement;
    quickStatusToggleRef.value = button; // Store ref to button for repositioning

    const buttonRect = button.getBoundingClientRect();
    quickStatusPosition.value = computeQuickStatusPosition(buttonRect);

    // Add scroll/resize listeners to keep dropdown positioned correctly
    addQuickStatusListeners();
  }
};

// Update dropdown position based on stored toggle button reference
const updateQuickStatusPosition = () => {
  if (!quickStatusToggleRef.value || !quickStatusOpen.value) return;

  const button = quickStatusToggleRef.value;
  const buttonRect = button.getBoundingClientRect();

  // If button is no longer visible (scrolled out of view), close dropdown
  if (buttonRect.bottom < 0 || buttonRect.top > window.innerHeight) {
    closeQuickStatusDropdown();
    return;
  }

  quickStatusPosition.value = computeQuickStatusPosition(buttonRect);
};


// Add scroll/resize listeners when dropdown opens
const addQuickStatusListeners = () => {
  window.addEventListener('scroll', updateQuickStatusPosition, true); // capture phase for nested scrolls
  window.addEventListener('resize', updateQuickStatusPosition);
};

// Remove scroll/resize listeners when dropdown closes
const removeQuickStatusListeners = () => {
  window.removeEventListener('scroll', updateQuickStatusPosition, true);
  window.removeEventListener('resize', updateQuickStatusPosition);
};

// Centralized helper to close quick status dropdown and clean up resources
// Ensures listeners are removed and refs are cleared to prevent memory leaks
const closeQuickStatusDropdown = () => {
  quickStatusOpen.value = null;
  removeQuickStatusListeners();
  quickStatusToggleRef.value = null;
};

// Status change confirmation
const initiateStatusChange = (submission: Submission, newStatus: FeedbackStatus) => {
  confirmStatusChange.value = {
    visible: true,
    submission,
    from: submission.status,
    to: newStatus,
    loading: false
  };
  closeQuickStatusDropdown();
};

const initiateStatusChangeFromModal = () => {
  if (!selectedSubmission.value || !selectedNewStatus.value) return;
  
  confirmStatusChange.value = {
    visible: true,
    submission: selectedSubmission.value,
    from: selectedSubmission.value.status,
    to: selectedNewStatus.value,
    loading: false
  };
};

const cancelStatusChange = () => {
  confirmStatusChange.value.visible = false;
  confirmStatusChange.value.submission = null;
  confirmStatusChange.value.from = '';
  confirmStatusChange.value.to = '';
  confirmStatusChange.value.loading = false;
};

const confirmStatusChangeAction = async () => {
  if (!confirmStatusChange.value.submission || !confirmStatusChange.value.to) return;
  
  // Set loading state
  confirmStatusChange.value.loading = true;
  
  try {
    const response = await $fetch(`/api/admin/super/feedback/submissions/${confirmStatusChange.value.submission.id}`, {
      method: 'PUT',
      body: { status: confirmStatusChange.value.to }
    });
    
    if (response.success) {
      // Update local state
      const index = submissions.value.findIndex(s => s.id === confirmStatusChange.value.submission?.id);
      if (index > -1) {
        submissions.value[index].status = confirmStatusChange.value.to;
        submissions.value[index].recentHistory = response.statusHistory?.slice(0, 3) || [];
      }
      
      // Update selected submission if open in modal
      if (selectedSubmission.value?.id === confirmStatusChange.value.submission.id) {
        selectedSubmission.value.status = confirmStatusChange.value.to;
        if (response.statusHistory) {
          statusHistory.value = response.statusHistory;
        }
        selectedNewStatus.value = '';
      }
      
      // Refresh analytics
      await fetchData();
      
      // Close confirmation
      cancelStatusChange();
    } else {
      // Handle failure case - reset loading so user can retry or close modal
      console.error('Failed to update status:', response);
      alert('Failed to update status. Please try again.');
      confirmStatusChange.value.loading = false;
    }
  } catch (e) {
    console.error('Failed to update status:', e);
    alert('Failed to update status. Please try again.');
    confirmStatusChange.value.loading = false;
  }
};

// Close dropdowns when clicking outside
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.status-dropdown-container')) {
    showStatusDropdown.value = false;
  }
  // Close quick status dropdown when clicking outside (not on the toggle button or the teleported dropdown)
  const isClickOnDropdown = quickStatusDropdownRef.value?.contains(target);
  const isClickOnToggle = target.closest('.quick-status-dropdown');
  if (!isClickOnDropdown && !isClickOnToggle) {
    closeQuickStatusDropdown();
  }
};

// Watch for modal open to load full history
watch(showHistory, async (newVal) => {
  if (newVal && selectedSubmission.value && statusHistory.value.length === 0) {
    await fetchStatusHistory(selectedSubmission.value.id);
  }
});

onMounted(() => {
  fetchData();
  document.addEventListener('click', handleClickOutside);
});

// Clean up
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  // Clean up quick status dropdown listeners if still active
  removeQuickStatusListeners();
});
</script>
