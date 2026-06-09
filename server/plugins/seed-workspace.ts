import { db, schema } from '../db';
import { eq } from 'drizzle-orm';

const { workspaces, projects } = schema;

const PERSONAL_WORKSPACE_ID = 'personal';
const PERSONAL_WORKSPACE_NAME = 'Personal';
const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_PROJECT_NAME = 'My Project';

export default defineNitroPlugin(async () => {
  try {
    // Check if Personal workspace already exists
    const existingWorkspace = (await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, PERSONAL_WORKSPACE_ID))
      .limit(1))[0];

    if (!existingWorkspace) {
      await db.insert(workspaces).values({
        id: PERSONAL_WORKSPACE_ID,
        name: PERSONAL_WORKSPACE_NAME
      });
      console.log('✅ Default "Personal" workspace seeded');
    }

    // Check if default project already exists
    const existingProject = (await db
      .select()
      .from(projects)
      .where(eq(projects.id, DEFAULT_PROJECT_ID))
      .limit(1))[0];

    if (!existingProject) {
      await db.insert(projects).values({
        id: DEFAULT_PROJECT_ID,
        workspaceId: PERSONAL_WORKSPACE_ID,
        name: DEFAULT_PROJECT_NAME
      });
      console.log('✅ Default "My Project" project seeded');
    }
  } catch (error) {
    // Table might not exist yet on first run before migrations
    console.warn('⚠️ Could not seed workspace/project - run db:push first:', error);
  }
});
