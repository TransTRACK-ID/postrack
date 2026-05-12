import { db } from '../../../../db';
import { usageEvents, dailyUsageStats, workspaces } from '../../../../db/schema';
import { sql, gte, lte, and, desc, count, sum, avg } from 'drizzle-orm';
import { isSuperAdmin } from '../../../../utils/permissions';

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

function getDateDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user;

    if (!user?.email || !isSuperAdmin(user.email)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden - Super admin access required'
      });
    }

    const query = getQuery(event);
    const startDate = query.startDate ? new Date(query.startDate as string) : getDateDaysAgo(90);
    const endDate = query.endDate ? new Date(query.endDate as string) : new Date();

    const now7Days = getDateDaysAgo(7);
    const now30Days = getDateDaysAgo(30);
    const now90Days = getDateDaysAgo(90);

    const detailedEvents = await db
      .select()
      .from(usageEvents)
      .where(gte(usageEvents.timestamp, startDate));

    const aggregatedStats = await db
      .select()
      .from(dailyUsageStats)
      .where(and(
        gte(sql`${dailyUsageStats.date}`, startDate.toISOString().split('T')[0]),
        lte(sql`${dailyUsageStats.date}`, endDate.toISOString().split('T')[0])
      ));

    const allWorkspaceData = await db.select().from(workspaces);

    const workspaceMap = new Map(allWorkspaceData.map(w => [w.id, w.name]));

    const totalEvents = detailedEvents.length + aggregatedStats.reduce((acc, s) => {
      return acc + (s.requestExecutions || 0) + (s.requestCreates || 0) + (s.requestUpdates || 0) + (s.requestDeletes || 0) +
        (s.collectionCreates || 0) + (s.collectionUpdates || 0) + (s.collectionDeletes || 0) +
        (s.folderCreates || 0) + (s.folderUpdates || 0) + (s.folderDeletes || 0) +
        (s.mockCreates || 0) + (s.mockUpdates || 0) + (s.mockDeletes || 0) +
        (s.environmentCreates || 0) + (s.environmentUpdates || 0) + (s.environmentDeletes || 0) +
        (s.projectCreates || 0) + (s.projectUpdates || 0) + (s.projectDeletes || 0) +
        (s.workspaceCreates || 0) + (s.workspaceUpdates || 0) + (s.workspaceDeletes || 0);
    }, 0);

    const eventsLast7Days = detailedEvents.filter(e => e.timestamp >= now7Days).length;
    const eventsLast30Days = detailedEvents.filter(e => e.timestamp >= now30Days).length;
    const eventsLast90Days = detailedEvents.filter(e => e.timestamp >= now90Days).length;

    const activeUsers7Days = new Set(detailedEvents.filter(e => e.timestamp >= now7Days).map(e => e.userId)).size;
    const activeUsers30Days = new Set(detailedEvents.filter(e => e.timestamp >= now30Days).map(e => e.userId)).size;
    const activeUsers90Days = new Set(detailedEvents.filter(e => e.timestamp >= now90Days).map(e => e.userId)).size;

    const requestExecutions = detailedEvents.filter(e => e.eventType === 'request_execute').length +
      aggregatedStats.reduce((acc, s) => acc + (s.requestExecutions || 0), 0);

    const requestEventsWithSuccess = detailedEvents.filter(e => e.eventType === 'request_execute' && e.success !== null);
    const successCount = requestEventsWithSuccess.filter(e => e.success === true).length +
      aggregatedStats.reduce((acc, s) => acc + (s.totalSuccessCount || 0), 0);
    const failureCount = requestEventsWithSuccess.filter(e => e.success === false).length +
      aggregatedStats.reduce((acc, s) => acc + (s.totalFailureCount || 0), 0);
    const totalRequests = successCount + failureCount;
    const successRate = totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : null;

    const responseTimes = detailedEvents.filter(e => e.responseTimeMs !== null).map(e => e.responseTimeMs!);
    const avgResponseTimeMs = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    const userEventMap = new Map<string, { userId: string; userEmail: string; eventCount: number }>();
    for (const e of detailedEvents) {
      const existing = userEventMap.get(e.userId) || { userId: e.userId, userEmail: e.userEmail, eventCount: 0 };
      existing.eventCount++;
      userEventMap.set(e.userId, existing);
    }
    for (const s of aggregatedStats) {
      const existing = userEventMap.get(s.userId) || { userId: s.userId, userEmail: s.userEmail, eventCount: 0 };
      existing.eventCount += (s.requestExecutions || 0) + (s.requestCreates || 0) + (s.requestUpdates || 0) + (s.requestDeletes || 0) +
        (s.collectionCreates || 0) + (s.collectionUpdates || 0) + (s.collectionDeletes || 0) +
        (s.folderCreates || 0) + (s.mockCreates || 0) + (s.mockUpdates || 0) + (s.mockDeletes || 0) +
        (s.environmentCreates || 0) + (s.environmentUpdates || 0) + (s.environmentDeletes || 0);
      userEventMap.set(s.userId, existing);
    }
    const topUsers = Array.from(userEventMap.values())
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    const workspaceEventMap = new Map<string, { workspaceId: string; workspaceName: string; eventCount: number }>();
    for (const e of detailedEvents) {
      const existing = workspaceEventMap.get(e.workspaceId) || {
        workspaceId: e.workspaceId,
        workspaceName: workspaceMap.get(e.workspaceId) || 'Unknown',
        eventCount: 0
      };
      existing.eventCount++;
      workspaceEventMap.set(e.workspaceId, existing);
    }
    for (const s of aggregatedStats) {
      const existing = workspaceEventMap.get(s.workspaceId) || {
        workspaceId: s.workspaceId,
        workspaceName: workspaceMap.get(s.workspaceId) || 'Unknown',
        eventCount: 0
      };
      existing.eventCount += (s.requestExecutions || 0) + (s.requestCreates || 0) + (s.requestUpdates || 0) + (s.requestDeletes || 0) +
        (s.collectionCreates || 0) + (s.collectionUpdates || 0) + (s.collectionDeletes || 0) +
        (s.folderCreates || 0) + (s.mockCreates || 0) + (s.mockUpdates || 0) + (s.mockDeletes || 0) +
        (s.environmentCreates || 0) + (s.environmentUpdates || 0) + (s.environmentDeletes || 0);
      workspaceEventMap.set(s.workspaceId, existing);
    }
    const topWorkspaces = Array.from(workspaceEventMap.values())
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    const eventsByType: Record<string, number> = {};
    for (const e of detailedEvents) {
      eventsByType[e.eventType] = (eventsByType[e.eventType] || 0) + 1;
    }
    for (const s of aggregatedStats) {
      eventsByType['request_execute'] = (eventsByType['request_execute'] || 0) + (s.requestExecutions || 0);
      eventsByType['request_create'] = (eventsByType['request_create'] || 0) + (s.requestCreates || 0);
      eventsByType['request_update'] = (eventsByType['request_update'] || 0) + (s.requestUpdates || 0);
      eventsByType['request_delete'] = (eventsByType['request_delete'] || 0) + (s.requestDeletes || 0);
      eventsByType['collection_create'] = (eventsByType['collection_create'] || 0) + (s.collectionCreates || 0);
      eventsByType['collection_update'] = (eventsByType['collection_update'] || 0) + (s.collectionUpdates || 0);
      eventsByType['collection_delete'] = (eventsByType['collection_delete'] || 0) + (s.collectionDeletes || 0);
      eventsByType['folder_create'] = (eventsByType['folder_create'] || 0) + (s.folderCreates || 0);
      eventsByType['mock_create'] = (eventsByType['mock_create'] || 0) + (s.mockCreates || 0);
      eventsByType['mock_update'] = (eventsByType['mock_update'] || 0) + (s.mockUpdates || 0);
      eventsByType['mock_delete'] = (eventsByType['mock_delete'] || 0) + (s.mockDeletes || 0);
      eventsByType['environment_create'] = (eventsByType['environment_create'] || 0) + (s.environmentCreates || 0);
      eventsByType['environment_update'] = (eventsByType['environment_update'] || 0) + (s.environmentUpdates || 0);
      eventsByType['environment_delete'] = (eventsByType['environment_delete'] || 0) + (s.environmentDeletes || 0);
    }

    const overview: OverviewStats = {
      totalEvents,
      eventsLast7Days,
      eventsLast30Days,
      eventsLast90Days,
      activeUsersLast7Days: activeUsers7Days,
      activeUsersLast30Days: activeUsers30Days,
      activeUsersLast90Days: activeUsers90Days,
      requestExecutions,
      successRate,
      avgResponseTimeMs,
      topUsers,
      topWorkspaces,
      eventsByType,
    };

    return overview;
  } catch (error: any) {
    console.error('[Usage Overview] Error:', error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch usage overview'
    });
  }
});