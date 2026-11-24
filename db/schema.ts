import { integer, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const hubDocuments = sqliteTable('hub_documents', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  data: text('data').notNull(),
  mutationId: text('mutation_id').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const newsArticles=sqliteTable('news_articles',{
  id:text('id').primaryKey(),title:text('title').notNull(),url:text('url').notNull().unique(),
  sourceName:text('source_name').notNull(),sourceUrl:text('source_url').notNull(),
  description:text('description').notNull(),publishedAt:text('published_at').notNull(),
  firstSeenAt:text('first_seen_at').notNull(),lastSeenAt:text('last_seen_at').notNull(),
  categories:text('categories').notNull(),language:text('language').notNull(),
},table=>[index('news_published_idx').on(table.publishedAt,table.id)]);
export const newsUserStates=sqliteTable('news_user_states',{
  userId:text('user_id').notNull(),articleId:text('article_id').notNull().references(()=>newsArticles.id),
  isRead:integer('is_read').notNull().default(0),isSaved:integer('is_saved').notNull().default(0),isHidden:integer('is_hidden').notNull().default(0),updatedAt:text('updated_at').notNull(),
},table=>[primaryKey({columns:[table.userId,table.articleId]})]);
export const newsSync=sqliteTable('news_sync',{
  key:text('key').primaryKey(),startedAt:text('started_at'),finishedAt:text('finished_at'),lastSuccessAt:text('last_success_at'),
  leaseUntil:integer('lease_until').notNull().default(0),count:integer('count').notNull().default(0),sources:text('sources').notNull().default('[]'),
});
export const newsPreferences = sqliteTable('news_preferences', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  topics: text('topics').notNull(),
  sourcePreferences: text('source_preferences').notNull().default('[]'),
});

export const dailyBriefings = sqliteTable('daily_briefings', {
  day: text('day').notNull(),
  edition: text('edition').notNull(),
  document: text('document').notNull(),
  publishedAt: text('published_at').notNull(),
}, table => [primaryKey({ columns: [table.day, table.edition] })]);

// Shared snapshot is only exposed inside the existing owner-private Site.
export const notionCalendarSnapshots=sqliteTable('notion_calendar_snapshots',{
  key:text('key').primaryKey(),revision:integer('revision').notNull(),data:text('data').notNull(),mutationId:text('mutation_id').notNull(),updatedAt:text('updated_at').notNull(),
});

// Spotify credentials are encrypted with a runtime-only key, never in HUB backups.
export const spotifyConnections=sqliteTable('spotify_connections',{
  userId:text('user_id').primaryKey(),accountId:text('account_id').notNull(),spotifyUserId:text('spotify_user_id').notNull(),displayName:text('display_name').notNull(),
  accessCipher:text('access_cipher').notNull(),refreshCipher:text('refresh_cipher').notNull(),expiresAt:integer('expires_at').notNull(),scopes:text('scopes').notNull(),
  version:integer('version').notNull(),refreshLockUntil:integer('refresh_lock_until').notNull().default(0),blockedUntil:integer('blocked_until').notNull().default(0),updatedAt:text('updated_at').notNull(),
});
export const spotifyOauthStates=sqliteTable('spotify_oauth_states',{
  stateHash:text('state_hash').primaryKey(),userId:text('user_id').notNull(),browserHash:text('browser_hash').notNull(),scopes:text('scopes').notNull(),
  connectionVersion:integer('connection_version').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const spotifyMutations=sqliteTable('spotify_mutations',{
  userId:text('user_id').notNull(),requestId:text('request_id').notNull(),operationHash:text('operation_hash').notNull(),status:text('status').notNull(),response:text('response').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[primaryKey({columns:[table.userId,table.requestId]})]);

export const steamUserSettings=sqliteTable('steam_user_settings',{
  userId:text('user_id').primaryKey(),apiKeyCipher:text('api_key_cipher').notNull().default(''),keyRevision:text('key_revision').notNull(),activeSteamId:text('active_steam_id').notNull().default(''),updatedAt:text('updated_at').notNull(),
});
export const steamAccountLinks=sqliteTable('steam_account_links',{
  userId:text('user_id').notNull(),steamId:text('steam_id').notNull(),linkVersion:text('link_version').notNull(),name:text('name').notNull(),avatarUrl:text('avatar_url').notNull().default(''),connectedAt:text('connected_at').notNull(),
  ownedJson:text('owned_json').notNull().default('[]'),recentJson:text('recent_json').notNull().default('[]'),ownedAt:text('owned_at').notNull().default(''),recentAt:text('recent_at').notNull().default(''),syncError:text('sync_error').notNull().default(''),recentError:text('recent_error').notNull().default(''),lastAttempt:integer('last_attempt').notNull().default(0),retryAt:integer('retry_at').notNull().default(0),syncToken:text('sync_token').notNull().default(''),leaseUntil:integer('lease_until').notNull().default(0),
},table=>[primaryKey({columns:[table.userId,table.steamId]})]);
export const steamOpenidStates=sqliteTable('steam_openid_states',{
  stateHash:text('state_hash').primaryKey(),userId:text('user_id').notNull(),browserHash:text('browser_hash').notNull(),returnTo:text('return_to').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const steamOpenidNonces=sqliteTable('steam_openid_nonces',{
  nonceHash:text('nonce_hash').primaryKey(),expiresAt:integer('expires_at').notNull(),
});

/** The track list of a portable player (paths only, read from a playlist the player exported), one per HUB user. */
export const musicDeviceLibraries=sqliteTable('music_device_libraries',{
  userId:text('user_id').primaryKey(),
  name:text('name').notNull(),
  suffix:text('suffix').notNull(),
  tracks:text('tracks').notNull(),
  trackCount:integer('track_count').notNull(),
  importedAt:text('imported_at').notNull(),
});
