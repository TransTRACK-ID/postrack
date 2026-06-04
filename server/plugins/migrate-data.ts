import { db, schema } from '../db';
import { eq, and, isNull } from 'drizzle-orm';

interface OldMock {
  id: string;
  collection: string;
  path: string;
  method: string;
  status: number;
  response: any;
  delay: number;
  secure?: boolean;
  createdAt: string;
}

interface OldCollection {
  id: string;
  name: string;
  description?: string;
  color: string;
  order: number;
  createdAt: string;
  updatedAt?: string;
}

export default defineNitroPlugin(async () => {
  // Skip in desktop mode
  if (process.env.ELECTRON_DESKTOP) {
    console.log('[Data Migration] Skipping in desktop mode')
    return
  }

  try {
    // Check if migration already completed
    const migrationStatus = (await db
      .select()
      .from(schema.settings)
      .where(
        and(
          eq(schema.settings.key, 'data_migration_completed'),
          isNull(schema.settings.workspaceId)
        )
      )
      .limit(1))[0];

    if (migrationStatus?.value) {
      console.log('✅ Data migration already completed, skipping...');
      return;
    }

    console.log('🔄 Starting data migration from file storage to SQLite...');

    const mocksStorage = useStorage('mocks');
    const collectionsStorage = useStorage('collections');
    const settingsStorage = useStorage('settings');

    // Migrate collections first
    const collectionKeys = await collectionsStorage.getKeys();
    const collectionMappings: Record<string, string> = {};
    
    for (const key of collectionKeys) {
      const oldCollection = await collectionsStorage.getItem(key) as OldCollection | null;
      if (oldCollection) {
        // Check if collection already exists
        const existing = (await db
          .select()
          .from(schema.collections)
          .where(eq(schema.collections.id, oldCollection.id))
          .limit(1))[0];

        if (!existing) {
          // Find a project to associate with (use first available or create default)
          const project = (await db.select().from(schema.projects).limit(1))[0];
          
          if (project) {
            await db.insert(schema.collections).values({
              id: oldCollection.id,
              projectId: project.id,
              name: oldCollection.name,
              description: oldCollection.description,
              createdAt: new Date(oldCollection.createdAt).getTime()
            });
            collectionMappings[oldCollection.id] = oldCollection.id;
            console.log(`✅ Migrated collection: ${oldCollection.name}`);
          }
        } else {
          collectionMappings[oldCollection.id] = oldCollection.id;
        }
      }
    }

    // Migrate mocks
    const mockKeys = await mocksStorage.getKeys();
    let migratedMocks = 0;
    
    for (const key of mockKeys) {
      const oldMock = await mocksStorage.getItem(key) as OldMock | null;
      if (oldMock) {
        // Check if mock already exists
        const existing = (await db
          .select()
          .from(schema.mocks)
          .where(eq(schema.mocks.id, oldMock.id))
          .limit(1))[0];

        if (!existing) {
          // Map collection reference
          let collectionId: string | null = null;
          if (oldMock.collection && oldMock.collection !== 'root') {
            collectionId = collectionMappings[oldMock.collection] || null;
          }

          await db.insert(schema.mocks).values({
            id: oldMock.id,
            collectionId: collectionId,
            path: oldMock.path,
            method: oldMock.method.toUpperCase(),
            status: oldMock.status,
            response: oldMock.response,
            delay: oldMock.delay || 0,
            secure: oldMock.secure || false,
            createdAt: new Date(oldMock.createdAt).getTime()
          });
          migratedMocks++;
        }
      }
    }

    if (migratedMocks > 0) {
      console.log(`✅ Migrated ${migratedMocks} mocks`);
    }

    // Migrate settings
    const globalSettings = await settingsStorage.getItem('global') as { bearerToken?: string } | null;
    if (globalSettings?.bearerToken) {
      const existing = (await db
        .select()
        .from(schema.settings)
        .where(
          and(
            eq(schema.settings.key, 'bearerToken'),
            isNull(schema.settings.workspaceId)
          )
        )
        .limit(1))[0];

      if (!existing) {
        await db.insert(schema.settings).values({
          key: 'bearerToken',
          value: globalSettings.bearerToken
        });
        console.log('✅ Migrated bearerToken setting');
      }
    }

    // Mark migration as completed
    await db.insert(schema.settings).values({
      key: 'data_migration_completed',
      value: {
        timestamp: new Date().toISOString(),
        collectionsMigrated: Object.keys(collectionMappings).length,
        mocksMigrated: migratedMocks
      }
    });

    console.log('✅ Data migration completed successfully');

  } catch (error) {
    console.error('❌ Data migration failed:', error);
  }
});
