import { pgTable, text, serial, integer, boolean, timestamp, decimal, date, index } from "drizzle-orm/pg-core";
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
  mycoportalNumber: text("mycoportal_number"),
  dnaSequence: text("dna_sequence"),
  sequence: text("sequence"),
  
  // Additional fields from Excel
  collectionNumber: text("collection_number"),
  creationDate: date("creation_date"),
  verified: text("verified"),
  kingdom: text("kingdom"),
  authority: text("authority"),
  abbreviatedAuthority: text("abbreviated_authority"),
  mycobankNumber: text("mycobank_number"),
  fungariumSpecimen: text("fungarium_specimen"),
  images: text("images"),
  flags: text("flags"),
  forwardPrimer: text("forward_primer"),
  reversePrimer: text("reverse_primer"),
  runName: text("run_name"),
  sequence2: text("sequence_2"),
  forwardPrimer2: text("forward_primer_2"),
  reversePrimer2: text("reverse_primer_2"),
  sequenceOwner2: text("sequence_owner_2"),
  runName2: text("run_name_2"),
  locationName: text("location_name"),
  notes: text("notes"),
  moNotes: text("mo_notes"),
  reportLink: text("report_link"),
  imageLink: text("image_link"),
  firstGenbankRecord: boolean("first_genbank_record").default(false),
  
  isFirstStateRecord: boolean("is_first_state_record").default(false),
  hasMultipleGenotypes: boolean("has_multiple_genotypes").default(false),
  source: text("source"), // iNaturalist or Mushroom Observer
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Index for date filtering and temporal trends
  observedOnIdx: index("observed_on_idx").on(table.observedOn),
  // Index for taxonomic distribution queries
  phylumIdx: index("phylum_idx").on(table.phylum),
  // Index for metrics calculations - scientific name for species count
  scientificNameIdx: index("scientific_name_idx").on(table.scientificName),
  // Index for contributor analysis
  observerIdx: index("observer_idx").on(table.observer),
  // Index for geographic/state analysis
  stateIdx: index("state_idx").on(table.state),
  // Index for state records queries
  firstStateRecordIdx: index("first_state_record_idx").on(table.isFirstStateRecord),
  // Composite index for date range filtering with state
  observedStateIdx: index("observed_state_idx").on(table.observedOn, table.state),
  // Composite index for species frequency analysis
  speciesCountIdx: index("species_count_idx").on(table.scientificName, table.observedOn),
}));

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
}, (table) => ({
  // Index for top contributors query
  observationCountIdx: index("contributor_observation_count_idx").on(table.observationCount),
  // Index for contributor name lookups
  nameIdx: index("contributor_name_idx").on(table.name),
}));

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
}, (table) => ({
  // Index for top species and rare species queries
  observationCountIdx: index("species_observation_count_idx").on(table.observationCount),
  // Index for scientific name lookups
  scientificNameIdx: index("species_scientific_name_idx").on(table.scientificName),
  // Index for last observed date
  lastObservedIdx: index("species_last_observed_idx").on(table.lastObserved),
}));

// GPS coordinate index table for fast map loading
export const gpsIndex = pgTable("gps_index", {
  id: serial("id").primaryKey(),
  observationId: integer("observation_id").notNull().references(() => observations.id),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  state: text("state"),
  species: text("species"),
  observedOn: date("observed_on"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Spatial index for geographic queries
  locationIdx: index("gps_location_idx").on(table.latitude, table.longitude),
  // Index for state-based filtering
  stateIdx: index("gps_state_idx").on(table.state),
  // Index for observation lookup
  observationIdx: index("gps_observation_idx").on(table.observationId),
  // Composite index for filtered map queries
  stateLocationIdx: index("gps_state_location_idx").on(table.state, table.latitude, table.longitude),
}));

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

export const insertGpsIndexSchema = createInsertSchema(gpsIndex).omit({
  id: true,
  updatedAt: true,
});

// Types
export type InsertObservation = z.infer<typeof insertObservationSchema>;
export type Observation = typeof observations.$inferSelect;

export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploads.$inferSelect;

export type InsertContributor = z.infer<typeof insertContributorSchema>;
export type Contributor = typeof contributors.$inferSelect;

export type InsertGpsIndex = z.infer<typeof insertGpsIndexSchema>;
export type GpsIndex = typeof gpsIndex.$inferSelect;

export type InsertSpecies = z.infer<typeof insertSpeciesSchema>;
export type Species = typeof species.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
