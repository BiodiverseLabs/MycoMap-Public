import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar, text } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  iNaturalistUsername: varchar("inaturalist_username", { length: 100 }),
  mushroomObserverUsername: varchar("mushroom_observer_username", { length: 100 }),
  splitsSentToMyco: boolean("splits_sent_to_myco").default(false),
  role: varchar("role", { length: 20 }).default("member").notNull(),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default("none").notNull(),
  subscriptionTier: varchar("subscription_tier", { length: 50 }),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  lastLoginAt: timestamp("last_login_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
