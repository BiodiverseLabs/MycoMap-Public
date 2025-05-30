import { pgTable, text, serial, integer, boolean, timestamp, decimal, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const observations = pgTable("observations", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull().unique(),
  scientificName: text("scientific_name").notNull(),
  commonName: text("common_name"),
  phylum: text("phylum"),
  class: text("class"),
  order: text("order"),
  family: text("family"),
  genus: text("genus"),
  species: text("species"),
  infraspecies: text("infraspecies"),
  observer: text("observer"),
  collector: text("collector"),
  observedOn: date("observed_on"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  placeGuess: text("place_guess"),
  state: text("state"),
  country: text("country"),
  genbankAccession: text("genbank_accession"),
  isFirstStateRecord: boolean("is_first_state_record").default(false),
  hasMultipleGenotypes: boolean("has_multiple_genotypes").default(false),
  source: text("source"), // iNaturalist or Mushroom Observer
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  recordCount: integer("record_count").notNull(),
  status: text("status").notNull(), // 'processing', 'completed', 'failed'
  errorMessage: text("error_message"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const contributors = pgTable("contributors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  affiliation: text("affiliation"),
  observationCount: integer("observation_count").default(0),
  verificationRate: decimal("verification_rate", { precision: 5, scale: 2 }),
  firstObservation: date("first_observation"),
  lastObservation: date("last_observation"),
});

export const species = pgTable("species", {
  id: serial("id").primaryKey(),
  scientificName: text("scientific_name").notNull().unique(),
  commonName: text("common_name"),
  phylum: text("phylum"),
  class: text("class"),
  order: text("order"),
  family: text("family"),
  genus: text("genus"),
  observationCount: integer("observation_count").default(0),
  firstObserved: date("first_observed"),
  lastObserved: date("last_observed"),
  stateCount: integer("state_count").default(0),
});

// Relations
export const observationsRelations = relations(observations, ({ one }) => ({
  contributor: one(contributors, {
    fields: [observations.observer],
    references: [contributors.name],
  }),
}));

export const contributorsRelations = relations(contributors, ({ many }) => ({
  observations: many(observations),
}));

export const uploadsRelations = relations(uploads, ({ many }) => ({
  observations: many(observations),
}));

// Insert schemas
export const insertObservationSchema = createInsertSchema(observations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUploadSchema = createInsertSchema(uploads).omit({
  id: true,
  uploadedAt: true,
});

export const insertContributorSchema = createInsertSchema(contributors).omit({
  id: true,
});

export const insertSpeciesSchema = createInsertSchema(species).omit({
  id: true,
});

// Types
export type InsertObservation = z.infer<typeof insertObservationSchema>;
export type Observation = typeof observations.$inferSelect;

export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploads.$inferSelect;

export type InsertContributor = z.infer<typeof insertContributorSchema>;
export type Contributor = typeof contributors.$inferSelect;

export type InsertSpecies = z.infer<typeof insertSpeciesSchema>;
export type Species = typeof species.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
