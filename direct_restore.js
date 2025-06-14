import pkg from 'drizzle-orm/node-postgres';
const { drizzle } = pkg;
import { Pool } from 'pg';
import { observations } from './shared/schema.ts';
import XLSX from 'xlsx';
import fs from 'fs';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = drizzle(pool);

async function directRestore() {
  console.log('Starting direct restoration of original dataset...');
  
  try {
    // Clear existing data
    console.log('Clearing existing data...');
    await db.delete(observations);
    
    // Load Excel file directly
    const excelPath = './attached_assets/Validated Observations05.30.25.xlsx';
    console.log(`Reading Excel file: ${excelPath}`);
    
    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Loaded ${jsonData.length} records from Excel file`);
    
    // Process in smaller batches to avoid memory issues
    const batchSize = 500;
    let totalProcessed = 0;
    
    for (let i = 0; i < jsonData.length; i += batchSize) {
      const batch = jsonData.slice(i, i + batchSize);
      
      const observations = batch.map(row => ({
        observationId: row['observation_id'] || null,
        scientificName: row['scientific_name'] || null,
        commonName: row['common_name'] || null,
        kingdom: row['kingdom'] || null,
        phylum: row['phylum'] || null,
        class: row['class'] || null,
        order: row['order'] || null,
        family: row['family'] || null,
        genus: row['genus'] || null,
        specificEpithet: row['specific_epithet'] || null,
        infraspecificEpithet: row['infraspecific_epithet'] || null,
        taxonRank: row['taxon_rank'] || null,
        identifiedBy: row['identified_by'] || null,
        dateIdentified: row['date_identified'] ? new Date(row['date_identified']) : null,
        identificationReferences: row['identification_references'] || null,
        identificationRemarks: row['identification_remarks'] || null,
        taxonRemarks: row['taxon_remarks'] || null,
        identificationQualifier: row['identification_qualifier'] || null,
        typeStatus: row['type_status'] || null,
        recordedBy: row['recorded_by'] || null,
        recordedById: row['recorded_by_id'] || null,
        associatedCollectors: row['associated_collectors'] || null,
        recordNumber: row['record_number'] || null,
        individualCount: row['individual_count'] || null,
        organismQuantity: row['organism_quantity'] || null,
        organismQuantityType: row['organism_quantity_type'] || null,
        sex: row['sex'] || null,
        lifeStage: row['life_stage'] || null,
        reproductiveCondition: row['reproductive_condition'] || null,
        behavior: row['behavior'] || null,
        establishmentMeans: row['establishment_means'] || null,
        degreeOfEstablishment: row['degree_of_establishment'] || null,
        pathway: row['pathway'] || null,
        occurrenceStatus: row['occurrence_status'] || null,
        preparations: row['preparations'] || null,
        disposition: row['disposition'] || null,
        otherCatalogNumbers: row['other_catalog_numbers'] || null,
        associatedOccurrences: row['associated_occurrences'] || null,
        associatedOrganisms: row['associated_organisms'] || null,
        associatedTaxa: row['associated_taxa'] || null,
        relationshipAccordingTo: row['relationship_according_to'] || null,
        relationshipEstablishedDate: row['relationship_established_date'] ? new Date(row['relationship_established_date']) : null,
        relationshipRemarks: row['relationship_remarks'] || null,
        occurrenceRemarks: row['occurrence_remarks'] || null,
        catalogNumber: row['catalog_number'] || null,
        recordEnteredBy: row['record_entered_by'] || null,
        dateLastModified: row['date_last_modified'] ? new Date(row['date_last_modified']) : null,
        institutionId: row['institution_id'] || null,
        collectionId: row['collection_id'] || null,
        datasetId: row['dataset_id'] || null,
        institutionCode: row['institution_code'] || null,
        collectionCode: row['collection_code'] || null,
        datasetName: row['dataset_name'] || null,
        ownerInstitutionCode: row['owner_institution_code'] || null,
        basisOfRecord: row['basis_of_record'] || null,
        informationWithheld: row['information_withheld'] || null,
        dataGeneralizations: row['data_generalizations'] || null,
        dynamicProperties: row['dynamic_properties'] || null,
        localityId: row['locality_id'] || null,
        continent: row['continent'] || null,
        waterBody: row['water_body'] || null,
        islandGroup: row['island_group'] || null,
        island: row['island'] || null,
        country: row['country'] || null,
        countryCode: row['country_code'] || null,
        stateProvince: row['state_province'] || null,
        county: row['county'] || null,
        municipality: row['municipality'] || null,
        locality: row['locality'] || null,
        locationAccordingTo: row['location_according_to'] || null,
        locationRemarks: row['location_remarks'] || null,
        decimalLatitude: typeof row['decimal_latitude'] === 'number' ? row['decimal_latitude'] : null,
        decimalLongitude: typeof row['decimal_longitude'] === 'number' ? row['decimal_longitude'] : null,
        geodeticDatum: row['geodetic_datum'] || null,
        coordinateUncertaintyInMeters: typeof row['coordinate_uncertainty_in_meters'] === 'number' ? row['coordinate_uncertainty_in_meters'] : null,
        coordinatePrecision: row['coordinate_precision'] || null,
        pointRadiusSpatialFit: row['point_radius_spatial_fit'] || null,
        verbatimCoordinates: row['verbatim_coordinates'] || null,
        verbatimLatitude: row['verbatim_latitude'] || null,
        verbatimLongitude: row['verbatim_longitude'] || null,
        verbatimCoordinateSystem: row['verbatim_coordinate_system'] || null,
        verbatimSrs: row['verbatim_srs'] || null,
        footprintWkt: row['footprint_wkt'] || null,
        footprintSrs: row['footprint_srs'] || null,
        footprintSpatialFit: row['footprint_spatial_fit'] || null,
        georeferencedBy: row['georeferenced_by'] || null,
        georeferencedDate: row['georeferenced_date'] ? new Date(row['georeferenced_date']) : null,
        georeferencedProtocol: row['georeferenced_protocol'] || null,
        georeferencedSources: row['georeferenced_sources'] || null,
        georeferencedRemarks: row['georeferenced_remarks'] || null,
        minimumElevationInMeters: row['minimum_elevation_in_meters'] || null,
        maximumElevationInMeters: row['maximum_elevation_in_meters'] || null,
        minimumDistanceAboveSurfaceInMeters: row['minimum_distance_above_surface_in_meters'] || null,
        maximumDistanceAboveSurfaceInMeters: row['maximum_distance_above_surface_in_meters'] || null,
        minimumDepthInMeters: row['minimum_depth_in_meters'] || null,
        maximumDepthInMeters: row['maximum_depth_in_meters'] || null,
        verbatimDepth: row['verbatim_depth'] || null,
        verbatimElevation: row['verbatim_elevation'] || null,
        habitat: row['habitat'] || null,
        substrate: row['substrate'] || null,
        fieldNotes: row['field_notes'] || null,
        fieldNumber: row['field_number'] || null,
        eventDate: row['event_date'] ? new Date(row['event_date']) : null,
        eventTime: row['event_time'] || null,
        startDayOfYear: row['start_day_of_year'] ? new Date(row['start_day_of_year']) : null,
        endDayOfYear: row['end_day_of_year'] ? new Date(row['end_day_of_year']) : null,
        year: row['year'] || null,
        month: row['month'] || null,
        day: row['day'] || null,
        verbatimEventDate: row['verbatim_event_date'] || null,
        samplingProtocol: row['sampling_protocol'] || null,
        samplingEffort: row['sampling_effort'] || null,
        eventRemarks: row['event_remarks'] || null,
        source: row['source'] || null,
        url: row['url'] || null,
        imageUrl: row['image_url'] || null,
        dnaSequenceUrl: row['dna_sequence_url'] || null,
        traceFileUrl: row['trace_file_url'] || null
      }));
      
      // Insert batch directly into database
      await db.insert(observations).values(observations);
      totalProcessed += observations.length;
      
      console.log(`Processed batch ${Math.floor(i/batchSize) + 1}, total: ${totalProcessed}`);
    }
    
    console.log(`Successfully restored ${totalProcessed} observations!`);
    
    // Verify the restoration
    const result = await db.select().from(observations);
    console.log(`Final verification: ${result.length} observations in database`);
    
  } catch (error) {
    console.error('Restoration failed:', error);
  }
}

directRestore();