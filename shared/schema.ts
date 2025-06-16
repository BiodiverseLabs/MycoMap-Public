import { pgTable, text, serial, integer, boolean, timestamp, decimal, date, numeric, index } from "drizzle-orm/pg-core";
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

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
  imageLink: text("image_link"),
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
