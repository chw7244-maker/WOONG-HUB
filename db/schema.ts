import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const hubDocuments = sqliteTable('hub_documents', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull(),
  data: text('data').notNull(),
  mutationId: text('mutation_id').notNull(),
  updatedAt: text('updated_at').notNull(),
});
