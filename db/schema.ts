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

// Shared snapshot is only exposed inside the existing owner-private Site.
export const notionCalendarSnapshots=sqliteTable('notion_calendar_snapshots',{
  key:text('key').primaryKey(),revision:integer('revision').notNull(),data:text('data').notNull(),mutationId:text('mutation_id').notNull(),updatedAt:text('updated_at').notNull(),
});
