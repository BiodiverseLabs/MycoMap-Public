import { pgTable, text, serial, integer, boolean, timestamp, decimal, date, numeric, index, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Legacy users table - preserved for historical data (renamed from 'users')
export const legacyUsers = pgTable("legacy_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Re-export auth models (users, sessions) for Replit Auth integration
export * from "./models/auth";
import { users } from "./models/auth";

export const observations = pgTable("observations", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull(),
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
  imageLink: text("image_link"), // ❌ DO NOT USE - CONTAINS STALE URLS - Use cache tables (inaturalistData.photos, etc.) instead
  firstGenbankRecord: boolean("first_genbank_record").default(false),
  
  isFirstStateRecord: boolean("is_first_state_record").default(false),
  hasMultipleGenotypes: boolean("has_multiple_genotypes").default(false),
  source: text("source"), // iNaturalist or Mushroom Observer
  sourceUrl: text("source_url"),
  nameUpdate: boolean("name_update").default(false),
  classificationUpdate: boolean("classification_update").default(false),
  
  // BLAST results tracking
  mycoMapBlastUrl: text("mycomap_blast_url"),
  ncbiBlastFile: text("ncbi_blast_file"), // Local path to downloaded NCBI XML
  localBlastFile: text("local_blast_file"), // Local path to downloaded Local XML
  blastFilesDownloaded: boolean("blast_files_downloaded").default(false),
  blastDownloadDate: timestamp("blast_download_date"),
  
  // Trace files tracking
  mycoMapTraceUrl: text("mycomap_trace_url"),
  fastqFile: text("fastq_file"), // Local path to downloaded FASTQ file
  traceFilesDownloaded: boolean("trace_files_downloaded").default(false),
  traceDownloadDate: timestamp("trace_download_date"),
  
  // iNaturalist API response tracking
  inatApiFile: text("inat_api_file"), // Local path to saved API response text file
  inatApiSaved: boolean("inat_api_saved").default(false),
  inatApiSaveDate: timestamp("inat_api_save_date"),
  
  // IPFS web3 storage tracking
  ipfsUploaded: boolean("ipfs_uploaded").default(false),
  ipfsUploadDate: timestamp("ipfs_upload_date"),
  ipfsFolderCid: text("ipfs_folder_cid"), // CID for the complete observation folder
  ipfsFolderUrl: text("ipfs_folder_url"), // https://ipfs.io/ipfs/{cid}
  ipfsNcbiBlastUrl: text("ipfs_ncbi_blast_url"), // Individual file IPFS URLs
  ipfsLocalBlastUrl: text("ipfs_local_blast_url"),
  ipfsFastqUrl: text("ipfs_fastq_url"),
  ipfsInatApiUrl: text("ipfs_inat_api_url"),
  
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
  // Index for validation page source filtering
  sourceIdx: index("source_idx").on(table.source),
  // Index for observation ID lookups (used heavily in validation)
  observationIdIdx: index("observation_id_idx").on(table.observationId),
  // Composite index for validation queries (source + observationId)
  sourceObservationIdx: index("source_observation_idx").on(table.source, table.observationId),
  // Composite unique constraint: same observation ID can exist across different sources
  sourceObservationUnique: unique("source_observation_unique").on(table.source, table.observationId),
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
  scientificName: text("scientific_name"),
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

// Red List assessments table for conservation status
export const redlistAssessments = pgTable("redlist_assessments", {
  id: serial("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().unique(),
  internalTaxonId: text("internal_taxon_id"),
  scientificName: text("scientific_name").notNull(),
  redlistCategory: text("redlist_category"),
  redlistCriteria: text("redlist_criteria"),
  yearPublished: integer("year_published"),
  assessmentDate: timestamp("assessment_date"),
  criteriaVersion: text("criteria_version"),
  language: text("language"),
  rationale: text("rationale"),
  habitat: text("habitat"),
  threats: text("threats"),
  population: text("population"),
  populationTrend: text("population_trend"),
  range: text("range"),
  useTrade: text("use_trade"),
  systems: text("systems"),
  conservationActions: text("conservation_actions"),
  realm: text("realm"),
  yearLastSeen: integer("year_last_seen"),
  possiblyExtinct: boolean("possibly_extinct").default(false),
  possiblyExtinctInTheWild: boolean("possibly_extinct_in_the_wild").default(false),
  scopes: text("scopes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Index for scientific name lookups
  scientificNameIdx: index("redlist_scientific_name_idx").on(table.scientificName),
  // Index for conservation category
  categoryIdx: index("redlist_category_idx").on(table.redlistCategory),
  // Index for assessment ID
  assessmentIdx: index("redlist_assessment_idx").on(table.assessmentId),
}));

export const inaturalistPlaces = pgTable("inaturalist_places", {
  id: serial("id").primaryKey(),
  placeId: integer("place_id").notNull().unique(),
  name: text("name"),
  displayName: text("display_name"),
  adminLevel: integer("admin_level"), // 0=country, 1=state/province, 2=county, etc.
  placeType: text("place_type"), // state, county, country, etc.
  ancestry: text("ancestry"), // slash-separated parent place IDs
  boundingBoxSwlat: numeric("bounding_box_swlat"),
  boundingBoxSwlng: numeric("bounding_box_swlng"),
  boundingBoxNelat: numeric("bounding_box_nelat"),
  boundingBoxNelng: numeric("bounding_box_nelng"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  placeIdIdx: index("inat_place_id_idx").on(table.placeId),
  adminLevelIdx: index("inat_admin_level_idx").on(table.adminLevel),
  placeTypeIdx: index("inat_place_type_idx").on(table.placeType),
}));

// iNaturalist classification cache table for all taxonomic search terms
export const inaturalistClassificationCache = pgTable("inaturalist_classification_cache", {
  id: serial("id").primaryKey(),
  searchTerm: text("search_term").notNull().unique(), // The term searched (genus, species, etc.)
  taxonRank: text("taxon_rank"), // The actual rank found (genus, species, family, etc.)
  taxonId: integer("taxon_id"), // iNaturalist taxon ID
  scientificName: text("scientific_name"), // Scientific name of the taxon
  commonName: text("common_name"), // Common name if available
  parentId: integer("parent_id"), // Parent taxon ID
  ancestry: text("ancestry"), // Full ancestry path
  kingdom: text("kingdom"),
  subkingdom: text("subkingdom"),
  phylum: text("phylum"),
  subphylum: text("subphylum"),
  class: text("class"),
  subclass: text("subclass"),
  order: text("order"),
  suborder: text("suborder"),
  infraorder: text("infraorder"),
  superfamily: text("superfamily"),
  family: text("family"),
  subfamily: text("subfamily"),
  tribe: text("tribe"),
  subtribe: text("subtribe"),
  genus: text("genus"),
  subgenus: text("subgenus"),
  section: text("section"),
  subsection: text("subsection"),
  species: text("species"),
  subspecies: text("subspecies"),
  variety: text("variety"),
  form: text("form"),
  observationsCount: integer("observations_count").default(0), // Number of observations on iNat
  isActive: boolean("is_active").default(true), // Whether the taxon is active on iNat
  apiResponse: text("api_response"), // Full JSON response from iNaturalist API
  lookupCount: integer("lookup_count").default(1), // How many times this term has been requested
  lastUsedAt: timestamp("last_used_at").defaultNow(), // When this cache entry was last accessed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  searchTermIdx: index("inat_classification_search_term_idx").on(table.searchTerm),
  taxonRankIdx: index("inat_classification_taxon_rank_idx").on(table.taxonRank),
  familyIdx: index("inat_classification_family_idx").on(table.family),
  lastUsedIdx: index("inat_classification_last_used_idx").on(table.lastUsedAt),
  lookupCountIdx: index("inat_classification_lookup_count_idx").on(table.lookupCount),
}));

// iNaturalist API cache table for refresh functionality
export const inaturalistApiCache = pgTable("inaturalist_api_cache", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull().unique(), // iNaturalist observation ID
  inatName: text("inat_name"), // Main scientific name from iNaturalist
  provisionalName: text("provisional_name"), // Field 10675: Provisional Species Name
  speciesNameOverride: text("species_name_override"), // Field 20259: Species Name Override
  qualityGrade: text("quality_grade"), // research, needs_id, casual
  apiResponseRaw: text("api_response_raw"), // Full JSON response for debugging
  lastRefreshed: timestamp("last_refreshed").defaultNow(),
  lastDbUpdate: timestamp("last_db_update"), // When the database was last updated with this data
  cacheExpiresAt: timestamp("cache_expires_at"), // For cache invalidation
}, (table) => ({
  observationIdIdx: index("inat_cache_observation_id_idx").on(table.observationId),
  lastRefreshedIdx: index("inat_cache_last_refreshed_idx").on(table.lastRefreshed),
  lastDbUpdateIdx: index("inat_cache_last_db_update_idx").on(table.lastDbUpdate),
  cacheExpiresIdx: index("inat_cache_expires_idx").on(table.cacheExpiresAt),
}));

// iNaturalist data table for validation and detailed records
export const inaturalistData = pgTable("inaturalist_data", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull().unique(), // Links to observations table
  inatId: text("inat_id").notNull(), // iNaturalist internal ID
  inatUuid: text("inat_uuid"), // iNaturalist UUID
  quality: text("quality"), // research, needs_id, casual
  captive: boolean("captive").default(false),
  geoprivacy: text("geoprivacy"), // open, obscured, private
  taxonGeoprivacy: text("taxon_geoprivacy"),
  coordinatesObscured: boolean("coordinates_obscured").default(false),
  publicPositionalAccuracy: integer("public_positional_accuracy"),
  licenseCode: text("license_code"),
  observedOnString: text("observed_on_string"),
  observedOnDetails: text("observed_on_details"),
  timeObservedAt: timestamp("time_observed_at"),
  timeZone: text("time_zone"),
  description: text("description"),
  tags: text("tags").array(),
  species_guess: text("species_guess"),
  identificationCount: integer("identification_count").default(0),
  numIdentificationAgreements: integer("num_identification_agreements").default(0),
  numIdentificationDisagreements: integer("num_identification_disagreements").default(0),
  commentsCount: integer("comments_count").default(0),
  created_at: timestamp("created_at_inat"),
  updated_at: timestamp("updated_at_inat"),
  photos: text("photos").array(), // Array of photo URLs
  sounds: text("sounds").array(), // Array of sound URLs
  taxon: text("taxon"), // JSON string of taxon details
  user: text("user"), // JSON string of user details
  place_ids: integer("place_ids").array(),
  project_ids: integer("project_ids").array(),
  application: text("application"), // JSON string of app details
  // Observation fields data
  observationFields: text("observation_fields"), // JSON string of all observation fields
  dnaBarcode: text("dna_barcode"), // Field 2330: DNA Barcode ITS
  provisionalSpeciesName: text("provisional_species_name"), // Field 10675: Provisional Species Name
  mycoMapBlastResults: text("mycomap_blast_results"), // Field 9864: MycoMap BLAST Results
  traceFiles: text("trace_files"), // Field 10109: Trace Files (Raw DNA Data)
  inatGenbankAccession: text("inat_genbank_accession"), // Fields 15353, 15324, 7555: GenBank Accession #
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  syncStatus: text("sync_status").default('pending'), // pending, success, error
  syncError: text("sync_error"),
}, (table) => ({
  // Index for observation lookup
  observationIdx: index("inat_observation_idx").on(table.observationId),
  // Index for iNat ID
  inatIdIdx: index("inat_id_idx").on(table.inatId),
  // Index for sync status
  syncStatusIdx: index("inat_sync_status_idx").on(table.syncStatus),
  // Index for quality grade
  qualityIdx: index("inat_quality_idx").on(table.quality),
}));

// Mushroom Observer data table for API validation
export const mushroomObserverData = pgTable("mushroom_observer_data", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull().unique(),
  moId: text("mo_id").notNull(), // Mushroom Observer ID
  moUuid: text("mo_uuid"),
  scientificName: text("scientific_name"),
  commonName: text("common_name"),
  observer: text("observer"),
  observedOn: text("observed_on"),
  location: text("location"),
  state: text("state"),
  country: text("country"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  photos: text("photos").array(),
  confidence: text("confidence"),
  vote: text("vote"),
  quality: text("quality"),
  isCollection: boolean("is_collection"),
  specimenAvailable: boolean("specimen_available"),
  notes: text("notes"),
  // DNA sequence data
  dnaBarcode: text("dna_barcode"),
  sequenceNotes: text("sequence_notes"),
  syncStatus: text("sync_status").default('pending'),
  syncError: text("sync_error"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  // API file tracking
  apiFile: text("api_file"),
  apiSaveDate: timestamp("api_save_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  observationIdx: index("mo_observation_idx").on(table.observationId),
  moIdIdx: index("mo_id_idx").on(table.moId),
  syncStatusIdx: index("mo_sync_status_idx").on(table.syncStatus),
}));

// MyCoPortal data table for validation and detailed records
export const mycoportalData = pgTable("mycoportal_data", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull().unique(), // Links to observations table
  catalogNumber: text("catalog_number"), // MyCoPortal specimen number
  collectionCode: text("collection_code"), // Institution collection code
  institutionCode: text("institution_code"), // Institution code
  scientificName: text("scientific_name"),
  commonName: text("common_name"),
  family: text("family"),
  genus: text("genus"),
  specificEpithet: text("specific_epithet"),
  infraspecificEpithet: text("infraspecific_epithet"),
  taxonRank: text("taxon_rank"),
  identifiedBy: text("identified_by"),
  dateIdentified: text("date_identified"),
  recordedBy: text("recorded_by"), // Collector
  recordNumber: text("record_number"),
  eventDate: text("event_date"), // Collection date
  year: integer("year"),
  month: integer("month"),
  day: integer("day"),
  country: text("country"),
  stateProvince: text("state_province"),
  county: text("county"),
  locality: text("locality"),
  habitat: text("habitat"),
  substrate: text("substrate"),
  decimalLatitude: numeric("decimal_latitude"),
  decimalLongitude: numeric("decimal_longitude"),
  coordinateUncertaintyInMeters: integer("coordinate_uncertainty_in_meters"),
  elevation: integer("elevation"),
  minimumElevationInMeters: integer("minimum_elevation_in_meters"),
  maximumElevationInMeters: integer("maximum_elevation_in_meters"),
  occurrenceRemarks: text("occurrence_remarks"),
  associatedTaxa: text("associated_taxa"),
  dynamicProperties: text("dynamic_properties"),
  // DNA/Molecular data
  geneticAccessionNumber: text("genetic_accession_number"),
  associatedSequences: text("associated_sequences"),
  // Image data
  associatedMedia: text("associated_media"),
  // Sync tracking
  syncStatus: text("sync_status").default('pending'), // pending, success, error
  syncError: text("sync_error"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  // API file tracking
  apiFile: text("api_file"),
  apiSaveDate: timestamp("api_save_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  observationIdx: index("myco_observation_idx").on(table.observationId),
  catalogNumberIdx: index("myco_catalog_number_idx").on(table.catalogNumber),
  syncStatusIdx: index("myco_sync_status_idx").on(table.syncStatus),
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

export const insertMycoportalDataSchema = createInsertSchema(mycoportalData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRedlistAssessmentSchema = createInsertSchema(redlistAssessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInaturalistDataSchema = createInsertSchema(inaturalistData).omit({
  id: true,
  lastSyncedAt: true,
});

export const insertInaturalistPlaceSchema = createInsertSchema(inaturalistPlaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMushroomObserverDataSchema = createInsertSchema(mushroomObserverData).omit({
  id: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInaturalistClassificationCacheSchema = createInsertSchema(inaturalistClassificationCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInaturalistApiCacheSchema = createInsertSchema(inaturalistApiCache).omit({
  id: true,
  lastRefreshed: true,
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

export type InsertRedlistAssessment = z.infer<typeof insertRedlistAssessmentSchema>;
export type RedlistAssessment = typeof redlistAssessments.$inferSelect;

export type InsertInaturalistData = z.infer<typeof insertInaturalistDataSchema>;
export type InaturalistData = typeof inaturalistData.$inferSelect;

export type InsertInaturalistPlace = z.infer<typeof insertInaturalistPlaceSchema>;
export type InaturalistPlace = typeof inaturalistPlaces.$inferSelect;

export type InsertMushroomObserverData = z.infer<typeof insertMushroomObserverDataSchema>;
export type MushroomObserverData = typeof mushroomObserverData.$inferSelect;

export type InsertInaturalistClassificationCache = z.infer<typeof insertInaturalistClassificationCacheSchema>;
export type InaturalistClassificationCache = typeof inaturalistClassificationCache.$inferSelect;

export type InsertInaturalistApiCache = z.infer<typeof insertInaturalistApiCacheSchema>;
export type InaturalistApiCache = typeof inaturalistApiCache.$inferSelect;

// User types now come from models/auth.ts via export *

// Biorecords table - Historical snapshots of fully validated observations
export const biorecords = pgTable("biorecords", {
  id: serial("id").primaryKey(),
  observationId: text("observation_id").notNull(),
  
  // Core observation data snapshot
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
  
  // Additional fields
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
  imageLink: text("image_link"), // ❌ DO NOT USE - CONTAINS STALE URLS - Use cache tables (inaturalistData.photos, etc.) instead
  firstGenbankRecord: boolean("first_genbank_record").default(false),
  
  isFirstStateRecord: boolean("is_first_state_record").default(false),
  hasMultipleGenotypes: boolean("has_multiple_genotypes").default(false),
  source: text("source"),
  sourceUrl: text("source_url"),
  
  // BLAST and trace file tracking at validation time
  mycoMapBlastUrl: text("mycomap_blast_url"),
  ncbiBlastFile: text("ncbi_blast_file"),
  localBlastFile: text("local_blast_file"),
  blastFilesDownloaded: boolean("blast_files_downloaded").default(false),
  blastDownloadDate: timestamp("blast_download_date"),
  mycoMapTraceUrl: text("mycomap_trace_url"),
  fastqFile: text("fastq_file"),
  traceFilesDownloaded: boolean("trace_files_downloaded").default(false),
  traceDownloadDate: timestamp("trace_download_date"),
  inatApiFile: text("inat_api_file"),
  inatApiSaved: boolean("inat_api_saved").default(false),
  inatApiSaveDate: timestamp("inat_api_save_date"),
  
  // External platform data snapshots
  inatScientificName: text("inat_scientific_name"),
  inatObserver: text("inat_observer"),
  inatObservedOn: text("inat_observed_on"),
  inatState: text("inat_state"),
  inatGenbankAccession: text("inat_genbank_accession"),
  
  moScientificName: text("mo_scientific_name"),
  moObserver: text("mo_observer"),
  moObservedOn: text("mo_observed_on"),
  moState: text("mo_state"),
  moDnaBarcode: text("mo_dna_barcode"),
  moSequenceNotes: text("mo_sequence_notes"),
  
  mycoportalScientificName: text("mycoportal_scientific_name"),
  mycoportalRecordedBy: text("mycoportal_recorded_by"),
  mycoportalEventDate: text("mycoportal_event_date"),
  mycoportalState: text("mycoportal_state"),
  mycoportalCatalogNumber: text("mycoportal_catalog_number"),
  
  // Validation metadata
  validatedAt: timestamp("validated_at").notNull().defaultNow(),
  validatedBy: text("validated_by"), // Could track who performed validation
  validationVersion: text("validation_version").default('1.0'), // Track validation criteria version
  
  // NFT/BioRecord minting metadata
  nftMinted: boolean("nft_minted").default(false),
  nftTokenId: text("nft_token_id"), // Blockchain token ID
  nftContractAddress: text("nft_contract_address"), // Smart contract address
  nftBlockchainNetwork: text("nft_blockchain_network"), // e.g., "ethereum", "polygon"
  nftMintedAt: timestamp("nft_minted_at"),
  nftMintedBy: text("nft_minted_by"), // Who triggered the mint
  nftMetadataUri: text("nft_metadata_uri"), // IPFS or centralized metadata URL
  nftImageUri: text("nft_image_uri"), // NFT image/media URL
  
  // Original observation reference
  originalObservationId: integer("original_observation_id").references(() => observations.id),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  observationIdIdx: index("biorecord_observation_id_idx").on(table.observationId),
  validatedAtIdx: index("biorecord_validated_at_idx").on(table.validatedAt),
  scientificNameIdx: index("biorecord_scientific_name_idx").on(table.scientificName),
  stateIdx: index("biorecord_state_idx").on(table.state),
}));

export const insertBiorecordSchema = createInsertSchema(biorecords).omit({
  id: true,
  validatedAt: true,
  createdAt: true,
});

export type InsertBiorecord = z.infer<typeof insertBiorecordSchema>;
export type Biorecord = typeof biorecords.$inferSelect;

// Field Guides table - User-created regional species guides
export const fieldGuides = pgTable("field_guides", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // Bounding box coordinates
  boundingBoxNorth: decimal("bounding_box_north", { precision: 10, scale: 7 }).notNull(),
  boundingBoxSouth: decimal("bounding_box_south", { precision: 10, scale: 7 }).notNull(),
  boundingBoxEast: decimal("bounding_box_east", { precision: 10, scale: 7 }).notNull(),
  boundingBoxWest: decimal("bounding_box_west", { precision: 10, scale: 7 }).notNull(),
  speciesCount: integer("species_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  nameIdx: index("field_guide_name_idx").on(table.name),
  createdAtIdx: index("field_guide_created_at_idx").on(table.createdAt),
}));

// Junction table for field guide species
export const fieldGuideSpecies = pgTable("field_guide_species", {
  id: serial("id").primaryKey(),
  fieldGuideId: integer("field_guide_id").notNull().references(() => fieldGuides.id, { onDelete: 'cascade' }),
  scientificName: text("scientific_name").notNull(),
  commonName: text("common_name"),
  family: text("family"),
  observationCount: integer("observation_count").default(0),
  selectedImageUrl: text("selected_image_url"), // URL of the selected representative image
  selectedImageSource: text("selected_image_source"), // "iNaturalist" or "MushroomObserver"  
  selectedObservationId: text("selected_observation_id"), // ID of the observation the image comes from
  selectedImageId: text("selected_image_id"), // ID of the specific image within the observation
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  fieldGuideIdx: index("field_guide_species_guide_idx").on(table.fieldGuideId),
  scientificNameIdx: index("field_guide_species_name_idx").on(table.scientificName),
  fieldGuideSpeciesUnique: unique("field_guide_species_unique").on(table.fieldGuideId, table.scientificName),
}));

// Relations for field guides
export const fieldGuidesRelations = relations(fieldGuides, ({ many }) => ({
  species: many(fieldGuideSpecies),
}));

export const fieldGuideSpeciesRelations = relations(fieldGuideSpecies, ({ one }) => ({
  fieldGuide: one(fieldGuides, {
    fields: [fieldGuideSpecies.fieldGuideId],
    references: [fieldGuides.id],
  }),
}));

// Insert schemas for field guides
export const insertFieldGuideSchema = createInsertSchema(fieldGuides).omit({
  id: true,
  speciesCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFieldGuideSpeciesSchema = createInsertSchema(fieldGuideSpecies).omit({
  id: true,
  addedAt: true,
});

// Types for field guides
export type InsertFieldGuide = z.infer<typeof insertFieldGuideSchema>;
export type FieldGuide = typeof fieldGuides.$inferSelect;

export type InsertFieldGuideSpecies = z.infer<typeof insertFieldGuideSpeciesSchema>;
export type FieldGuideSpecies = typeof fieldGuideSpecies.$inferSelect;

// iNaturalist Cache Tables
export const inatObservationsCache = pgTable("inat_observations_cache", {
  id: serial("id").primaryKey(),
  inatId: integer("inat_id").notNull().unique(), // iNaturalist observation ID
  scientificName: text("scientific_name"),
  commonName: text("common_name"),
  family: text("family"),
  rank: text("rank"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  observedOn: date("observed_on"),
  placeGuess: text("place_guess"),
  qualityGrade: text("quality_grade"),
  userName: text("user_name"), // iNaturalist contributor
  userLogin: text("user_login"),
  photos: text("photos").array(), // Array of photo URLs
  taxonData: text("taxon_data"), // JSON string of full taxon object
  userData: text("user_data"), // JSON string of full user object
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  latLngIdx: index("inat_cache_lat_lng_idx").on(table.latitude, table.longitude),
  scientificNameIdx: index("inat_cache_scientific_name_idx").on(table.scientificName),
  observedOnIdx: index("inat_cache_observed_on_idx").on(table.observedOn),
  userNameIdx: index("inat_cache_user_name_idx").on(table.userName),
}));

export const inatCacheMetadata = pgTable("inat_cache_metadata", {
  id: serial("id").primaryKey(),
  fieldGuideId: integer("field_guide_id").references(() => fieldGuides.id),
  centerLat: decimal("center_lat", { precision: 10, scale: 7 }).notNull(),
  centerLng: decimal("center_lng", { precision: 10, scale: 7 }).notNull(),
  maxRadiusMiles: decimal("max_radius_miles", { precision: 8, scale: 2 }).notNull(),
  boundingBoxNorth: decimal("bounding_box_north", { precision: 10, scale: 7 }).notNull(),
  boundingBoxSouth: decimal("bounding_box_south", { precision: 10, scale: 7 }).notNull(),
  boundingBoxEast: decimal("bounding_box_east", { precision: 10, scale: 7 }).notNull(),
  boundingBoxWest: decimal("bounding_box_west", { precision: 10, scale: 7 }).notNull(),
  observationsCount: integer("observations_count").default(0),
  lastFetchedAt: timestamp("last_fetched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  fieldGuideIdx: index("inat_cache_metadata_field_guide_idx").on(table.fieldGuideId),
  radiusIdx: index("inat_cache_metadata_radius_idx").on(table.maxRadiusMiles),
}));

// Relations for iNaturalist cache
export const inatCacheMetadataRelations = relations(inatCacheMetadata, ({ one }) => ({
  fieldGuide: one(fieldGuides, {
    fields: [inatCacheMetadata.fieldGuideId],
    references: [fieldGuides.id],
  }),
}));

// Insert schemas for iNaturalist cache
export const insertInatObservationsCacheSchema = createInsertSchema(inatObservationsCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInatCacheMetadataSchema = createInsertSchema(inatCacheMetadata).omit({
  id: true,
  createdAt: true,
});

// Types for iNaturalist cache
export type InsertInatObservationsCache = z.infer<typeof insertInatObservationsCacheSchema>;
export type InatObservationsCache = typeof inatObservationsCache.$inferSelect;

export type InsertInatCacheMetadata = z.infer<typeof insertInatCacheMetadataSchema>;
export type InatCacheMetadata = typeof inatCacheMetadata.$inferSelect;

// Mushroom Observer Cache Tables
export const moObservationsCache = pgTable("mo_observations_cache", {
  id: serial("id").primaryKey(),
  moId: integer("moId").notNull().unique(), // Mushroom Observer observation ID
  scientificName: text("scientificName"),
  commonName: text("commonName"),
  family: text("family"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  observedOn: date("observedOn"),
  placeName: text("placeName"), // MO location description
  userName: text("userName"), // MO contributor
  userLogin: text("userLogin"),
  notes: text("notes"), // Observation notes
  apiResponse: text("apiResponse"), // JSON string of full API response
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
}, (table) => ({
  latLngIdx: index("mo_cache_lat_lng_idx").on(table.latitude, table.longitude),
  scientificNameIdx: index("mo_cache_scientific_name_idx").on(table.scientificName),
  observedOnIdx: index("mo_cache_observed_on_idx").on(table.observedOn),
  userNameIdx: index("mo_cache_user_name_idx").on(table.userName),
}));

export const moCacheMetadata = pgTable("mo_cache_metadata", {
  id: serial("id").primaryKey(),
  fieldGuideId: integer("fieldGuideId").references(() => fieldGuides.id),
  centerLat: decimal("centerLat", { precision: 10, scale: 7 }).notNull(),
  centerLng: decimal("centerLng", { precision: 10, scale: 7 }).notNull(),
  maxRadiusMiles: decimal("maxRadiusMiles", { precision: 8, scale: 2 }).notNull(),
  boundingBoxNorth: decimal("boundingBoxNorth", { precision: 10, scale: 7 }).notNull(),
  boundingBoxSouth: decimal("boundingBoxSouth", { precision: 10, scale: 7 }).notNull(),
  boundingBoxEast: decimal("boundingBoxEast", { precision: 10, scale: 7 }).notNull(),
  boundingBoxWest: decimal("boundingBoxWest", { precision: 10, scale: 7 }).notNull(),
  observationsCount: integer("observationsCount").default(0),
  lastFetchedAt: timestamp("lastFetchedAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => ({
  fieldGuideIdx: index("mo_cache_metadata_field_guide_idx").on(table.fieldGuideId),
  radiusIdx: index("mo_cache_metadata_radius_idx").on(table.maxRadiusMiles),
}));

// Relations for Mushroom Observer cache
export const moCacheMetadataRelations = relations(moCacheMetadata, ({ one }) => ({
  fieldGuide: one(fieldGuides, {
    fields: [moCacheMetadata.fieldGuideId],
    references: [fieldGuides.id],
  }),
}));

// Insert schemas for Mushroom Observer cache
export const insertMoObservationsCacheSchema = createInsertSchema(moObservationsCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMoCacheMetadataSchema = createInsertSchema(moCacheMetadata).omit({
  id: true,
  createdAt: true,
});

// Types for Mushroom Observer cache
export type InsertMoObservationsCache = z.infer<typeof insertMoObservationsCacheSchema>;
export type MoObservationsCache = typeof moObservationsCache.$inferSelect;

export type InsertMoCacheMetadata = z.infer<typeof insertMoCacheMetadataSchema>;
export type MoCacheMetadata = typeof moCacheMetadata.$inferSelect;

// =============================================
// CMS TABLES - WordPress-style content management
// =============================================

// CMS Pages - Represents a single page in the website
export const cmsPages = pgTable("cms_pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  heroImageUrl: text("hero_image_url"),
  isPublished: boolean("is_published").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  authorId: text("author_id"),
  pageType: text("page_type").default("content").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// CMS Page Sections - Reusable content blocks within pages
export const cmsPageSections = pgTable("cms_page_sections", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull().references(() => cmsPages.id, { onDelete: "cascade" }),
  sectionType: text("section_type").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  content: text("content"),
  imageUrl: text("image_url"),
  buttonText: text("button_text"),
  buttonLink: text("button_link"),
  backgroundColor: text("background_color"),
  textColor: text("text_color"),
  data: text("data"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isVisible: boolean("is_visible").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Navigation Links - Main site navigation structure  
export const cmsNavigationLinks = pgTable("cms_navigation_links", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  href: text("href").notNull(),
  parentId: integer("parent_id"),
  isExternal: boolean("is_external").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isVisible: boolean("is_visible").default(true).notNull(),
  icon: text("icon"),
  requiresAuth: boolean("requires_auth").default(false).notNull(),
  requiresSubscription: boolean("requires_subscription").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Media Assets - Image and file library
export const cmsMediaAssets = pgTable("cms_media_assets", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  url: text("url").notNull(),
  altText: text("alt_text"),
  caption: text("caption"),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// CMS Relations
export const cmsPagesRelations = relations(cmsPages, ({ many }) => ({
  sections: many(cmsPageSections),
}));

export const cmsPageSectionsRelations = relations(cmsPageSections, ({ one }) => ({
  page: one(cmsPages, {
    fields: [cmsPageSections.pageId],
    references: [cmsPages.id],
  }),
}));

// Insert schemas for CMS
export const insertCmsPageSchema = createInsertSchema(cmsPages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCmsPageSectionSchema = createInsertSchema(cmsPageSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCmsNavigationLinkSchema = createInsertSchema(cmsNavigationLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCmsMediaAssetSchema = createInsertSchema(cmsMediaAssets).omit({
  id: true,
  createdAt: true,
});

// Types for CMS
export type InsertCmsPage = z.infer<typeof insertCmsPageSchema>;
export type CmsPage = typeof cmsPages.$inferSelect;

export type InsertCmsPageSection = z.infer<typeof insertCmsPageSectionSchema>;
export type CmsPageSection = typeof cmsPageSections.$inferSelect;

export type InsertCmsNavigationLink = z.infer<typeof insertCmsNavigationLinkSchema>;
export type CmsNavigationLink = typeof cmsNavigationLinks.$inferSelect;

export type InsertCmsMediaAsset = z.infer<typeof insertCmsMediaAssetSchema>;
export type CmsMediaAsset = typeof cmsMediaAssets.$inferSelect;

// ============ SUBSCRIPTION SYSTEM ============

// Subscription Plans - defines the available membership tiers
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  priceMinCents: integer("price_min_cents").notNull(),
  priceMaxCents: integer("price_max_cents").notNull(),
  priceDefaultCents: integer("price_default_cents").notNull(),
  billingPeriod: text("billing_period").notNull().default("monthly"),
  features: text("features").array(),
  specimensPerYear: text("specimens_per_year"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  stripePriceId: text("stripe_price_id"),
  paypalPlanId: text("paypal_plan_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Subscriptions - active subscription records
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: integer("plan_id").notNull(),
  status: text("status").notNull().default("pending"),
  provider: text("provider").notNull(),
  providerSubscriptionId: text("provider_subscription_id"),
  providerCustomerId: text("provider_customer_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").default("USD"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  canceledAt: timestamp("canceled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("user_subscriptions_user_idx").on(table.userId),
  statusIdx: index("user_subscriptions_status_idx").on(table.status),
}));

// Payment Transactions - log of all payment events
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  subscriptionId: integer("subscription_id"),
  provider: text("provider").notNull(),
  providerTransactionId: text("provider_transaction_id"),
  type: text("type").notNull(),
  status: text("status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").default("USD"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("payment_transactions_user_idx").on(table.userId),
  providerIdx: index("payment_transactions_provider_idx").on(table.provider),
}));

// Insert schemas for subscriptions
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({
  id: true,
  createdAt: true,
});

// Types for subscriptions
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;

export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;

// Foraging Lists - species lists for foraging categories
export const foragingLists = pgTable("foraging_lists", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(), // choice-edibles, edibles, medicinals, dyers, psychoactive
  csvData: text("csv_data"), // Raw CSV content
  fileName: text("file_name"),
  speciesCount: integer("species_count").default(0),
  uploadedAt: timestamp("uploaded_at"),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertForagingListSchema = createInsertSchema(foragingLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertForagingList = z.infer<typeof insertForagingListSchema>;
export type ForagingList = typeof foragingLists.$inferSelect;

// Fitness Observation Cache - stores iNaturalist observations for the Fitness Tracker
export const fitnessObservationCache = pgTable("fitness_observation_cache", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(), // iNaturalist username
  observationId: integer("observation_id").notNull(), // iNaturalist observation ID
  scientificName: text("scientific_name"),
  commonName: text("common_name"),
  observedOn: text("observed_on"), // Date string YYYY-MM-DD
  timeObserved: text("time_observed"), // Time string or observed_on_string
  latitude: text("latitude"),
  longitude: text("longitude"),
  photoUrl: text("photo_url"),
  placeGuess: text("place_guess"),
  inatUpdatedAt: timestamp("inat_updated_at"), // iNaturalist's updated_at for incremental sync
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete for removed observations
}, (table) => ({
  usernameIdx: index("fitness_cache_username_idx").on(table.username),
  observedOnIdx: index("fitness_cache_observed_on_idx").on(table.observedOn),
  uniqueUserObs: unique("fitness_cache_user_obs_unique").on(table.username, table.observationId),
}));

// Fitness Cache Metadata - tracks sync state per user
export const fitnessCacheMetadata = pgTable("fitness_cache_metadata", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  totalObservations: integer("total_observations").default(0),
  lastFullSyncAt: timestamp("last_full_sync_at"),
  lastIncrementalSyncAt: timestamp("last_incremental_sync_at"),
  lastSyncCursor: timestamp("last_sync_cursor"), // The max updated_at from last sync for incremental fetches
  lastProcessedPage: integer("last_processed_page").default(0), // Track exact page for resume
  totalExpectedObservations: integer("total_expected_observations").default(0), // Total from iNat API
  syncStatus: text("sync_status").default("idle"), // idle, syncing, completed, error, interrupted, cancelled
  syncProgress: integer("sync_progress").default(0), // 0-100 percentage
  syncMessage: text("sync_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFitnessObservationCacheSchema = createInsertSchema(fitnessObservationCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFitnessCacheMetadataSchema = createInsertSchema(fitnessCacheMetadata).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFitnessObservationCache = z.infer<typeof insertFitnessObservationCacheSchema>;
export type FitnessObservationCache = typeof fitnessObservationCache.$inferSelect;

export type InsertFitnessCacheMetadata = z.infer<typeof insertFitnessCacheMetadataSchema>;
export type FitnessCacheMetadata = typeof fitnessCacheMetadata.$inferSelect;

// Specimen Shipments - tracks user specimen submissions for DNA barcoding
export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // References auth users table
  status: text("status").notNull().default("draft"), // draft, pending_validation, validated, submitted, received, processing, completed
  trackingNumber: text("tracking_number"),
  
  // Questionnaire answers from page 1
  isNorthAmerica: boolean("is_north_america"),
  isMycoMapProject: boolean("is_mycomap_project"),
  mycoMapProjectName: text("mycomap_project_name"),
  hasObservations: boolean("has_observations"),
  isCompletelyDried: boolean("is_completely_dried"),
  isProperlyPackaged: boolean("is_properly_packaged"),
  hasSlimeMolds: text("has_slime_molds"), // "yes_separate" | "not_applicable"
  
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("shipments_user_id_idx").on(table.userId),
  statusIdx: index("shipments_status_idx").on(table.status),
}));

// Shipment Bags - individual bags within a shipment
export const shipmentBags = pgTable("shipment_bags", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Bag 1"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  shipmentIdIdx: index("shipment_bags_shipment_id_idx").on(table.shipmentId),
}));

// Shipment Specimens - individual specimens within a bag
export const shipmentSpecimens = pgTable("shipment_specimens", {
  id: serial("id").primaryKey(),
  bagId: integer("bag_id").notNull().references(() => shipmentBags.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("iNaturalist"), // iNaturalist | Mushroom Observer
  observationId: text("observation_id").notNull(), // The iNat/MO observation ID or URL
  
  // Validated data from API
  isValidated: boolean("is_validated").default(false),
  validationStatus: text("validation_status"), // valid | invalid | error | slime_mold
  validationMessage: text("validation_message"),
  scientificName: text("scientific_name"),
  observedDate: text("observed_date"),
  location: text("location"),
  username: text("username"),
  kingdom: text("kingdom"),
  taxonomicClass: text("taxonomic_class"), // For detecting Myxomycetes
  voucherNumber: text("voucher_number"), // From iNaturalist Voucher Number(s) observation field
  userOverride: boolean("user_override").default(false), // User clicked "This is ok"
  processingStatus: text("processing_status").default("pending"), // pending | submitted | received | processing | sequenced | complete
  
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bagIdIdx: index("shipment_specimens_bag_id_idx").on(table.bagId),
}));

// Relations for shipments
export const shipmentsRelations = relations(shipments, ({ many }) => ({
  bags: many(shipmentBags),
}));

export const shipmentBagsRelations = relations(shipmentBags, ({ one, many }) => ({
  shipment: one(shipments, {
    fields: [shipmentBags.shipmentId],
    references: [shipments.id],
  }),
  specimens: many(shipmentSpecimens),
}));

export const shipmentSpecimensRelations = relations(shipmentSpecimens, ({ one }) => ({
  bag: one(shipmentBags, {
    fields: [shipmentSpecimens.bagId],
    references: [shipmentBags.id],
  }),
}));

// Insert schemas
export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShipmentBagSchema = createInsertSchema(shipmentBags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShipmentSpecimenSchema = createInsertSchema(shipmentSpecimens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

export type InsertShipmentBag = z.infer<typeof insertShipmentBagSchema>;
export type ShipmentBag = typeof shipmentBags.$inferSelect;

export type InsertShipmentSpecimen = z.infer<typeof insertShipmentSpecimenSchema>;
export type ShipmentSpecimen = typeof shipmentSpecimens.$inferSelect;

// Extended types with relations
export type ShipmentWithBags = Shipment & {
  bags: (ShipmentBag & { specimens: ShipmentSpecimen[] })[];
};

// =============================================
// Lab Runs / Plates (Admin LIMS)
// =============================================

// Lab Runs - container for 20 plates
export const labRuns = pgTable("lab_runs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // draft | in_progress | completed
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Lab Plates - each run has up to 20 plates
export const labPlates = pgTable("lab_plates", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => labRuns.id, { onDelete: "cascade" }),
  plateNumber: integer("plate_number").notNull(), // 1-20
  name: text("name"), // Optional custom name
  notes: text("notes"), // Freeform plate notes
  sampleCount: integer("sample_count").notNull().default(96), // Number of wells (1-96), default 96
  orientation: text("orientation").notNull().default("right-left"), // right-left | left-right
  defaultForwardPrimer: text("default_forward_primer"),
  defaultReversePrimer: text("default_reverse_primer"),
  forwardIndexSetId: integer("forward_index_set_id"), // References index_sets.id
  reverseIndexSetId: integer("reverse_index_set_id"), // References index_sets.id
  status: text("status").notNull().default("empty"), // empty | partial | complete
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  runPlateIdx: index("lab_plates_run_plate_idx").on(table.runId, table.plateNumber),
}));

// Lab Wells - 96 wells per plate (A01-H12)
export const labWells = pgTable("lab_wells", {
  id: serial("id").primaryKey(),
  plateId: integer("plate_id").notNull().references(() => labPlates.id, { onDelete: "cascade" }),
  wellPosition: text("well_position").notNull(), // A01, B01, etc.
  sortOrder: integer("sort_order").notNull(), // 1-96
  
  // Specimen link
  platform: text("platform"), // iNaturalist | Mushroom Observer
  observationId: text("observation_id"),
  specimenId: integer("specimen_id").references(() => shipmentSpecimens.id),
  
  // Lab data
  labCode: text("lab_code"), // Internal lab tracking code
  primerPool: text("primer_pool"), // Primer pool identifier
  forwardPrimer: text("forward_primer"),
  reversePrimer: text("reverse_primer"),
  
  // Validation
  isValidated: boolean("is_validated").default(false),
  validationStatus: text("validation_status"), // valid | invalid | mismatch
  validationMessage: text("validation_message"),
  voucherNumber: text("voucher_number"), // From iNaturalist
  username: text("username"), // iNaturalist submitter username
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  plateWellIdx: index("lab_wells_plate_well_idx").on(table.plateId, table.wellPosition),
}));

// Relations for lab tables
export const labRunsRelations = relations(labRuns, ({ many, one }) => ({
  plates: many(labPlates),
  createdByUser: one(users, {
    fields: [labRuns.createdBy],
    references: [users.id],
  }),
}));

export const labPlatesRelations = relations(labPlates, ({ one, many }) => ({
  run: one(labRuns, {
    fields: [labPlates.runId],
    references: [labRuns.id],
  }),
  wells: many(labWells),
}));

export const labWellsRelations = relations(labWells, ({ one }) => ({
  plate: one(labPlates, {
    fields: [labWells.plateId],
    references: [labPlates.id],
  }),
  specimen: one(shipmentSpecimens, {
    fields: [labWells.specimenId],
    references: [shipmentSpecimens.id],
  }),
}));

// Index Sets - collections of index sequences for plates
export const indexSets = pgTable("index_sets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  orientation: text("orientation").notNull(), // Forward | Reverse
  type: text("type").notNull(), // Single | 96
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Index Entries - individual index sequences within a set
export const indexEntries = pgTable("index_entries", {
  id: serial("id").primaryKey(),
  indexSetId: integer("index_set_id").notNull().references(() => indexSets.id, { onDelete: "cascade" }),
  wellPosition: text("well_position").notNull(), // A01, B01, etc. or "single" for Single type
  indexSequence: text("index_sequence").notNull(),
}, (table) => ({
  setPositionIdx: index("index_entries_set_position_idx").on(table.indexSetId, table.wellPosition),
}));

// Relations for index tables
export const indexSetsRelations = relations(indexSets, ({ many }) => ({
  entries: many(indexEntries),
}));

export const indexEntriesRelations = relations(indexEntries, ({ one }) => ({
  indexSet: one(indexSets, {
    fields: [indexEntries.indexSetId],
    references: [indexSets.id],
  }),
}));

// Insert schemas for lab tables
export const insertLabRunSchema = createInsertSchema(labRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLabPlateSchema = createInsertSchema(labPlates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLabWellSchema = createInsertSchema(labWells).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for lab tables
export type InsertLabRun = z.infer<typeof insertLabRunSchema>;
export type LabRun = typeof labRuns.$inferSelect;

export type InsertLabPlate = z.infer<typeof insertLabPlateSchema>;
export type LabPlate = typeof labPlates.$inferSelect;

export type InsertLabWell = z.infer<typeof insertLabWellSchema>;
export type LabWell = typeof labWells.$inferSelect;

// Extended types with relations
export type LabRunWithPlates = LabRun & {
  plates: (LabPlate & { wells: LabWell[] })[];
};

export type LabPlateWithWells = LabPlate & {
  wells: LabWell[];
};

// Insert schemas for index tables
export const insertIndexSetSchema = createInsertSchema(indexSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndexEntrySchema = createInsertSchema(indexEntries).omit({
  id: true,
});

// Types for index tables
export type InsertIndexSet = z.infer<typeof insertIndexSetSchema>;
export type IndexSet = typeof indexSets.$inferSelect;

export type InsertIndexEntry = z.infer<typeof insertIndexEntrySchema>;
export type IndexEntry = typeof indexEntries.$inferSelect;

export type IndexSetWithEntries = IndexSet & {
  entries: IndexEntry[];
};
