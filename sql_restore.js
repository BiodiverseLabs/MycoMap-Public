import XLSX from 'xlsx';
import pg from 'pg';

const { Pool } = pg;

async function sqlRestore() {
  console.log('Starting SQL-based restoration...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    // Clear existing data
    console.log('Clearing existing data...');
    await pool.query('TRUNCATE TABLE observations CASCADE');
    
    // Load Excel file
    const excelPath = './attached_assets/Validated Observations05.30.25.xlsx';
    console.log(`Reading Excel file: ${excelPath}`);
    
    const workbook = XLSX.readFile(excelPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Loaded ${jsonData.length} records from Excel file`);
    
    // Process in batches
    const batchSize = 500;
    let totalProcessed = 0;
    
    for (let i = 0; i < jsonData.length; i += batchSize) {
      const batch = jsonData.slice(i, i + batchSize);
      
      const values = [];
      const placeholders = [];
      
      batch.forEach((row, index) => {
        const baseIndex = index * 108;
        placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15}, $${baseIndex + 16}, $${baseIndex + 17}, $${baseIndex + 18}, $${baseIndex + 19}, $${baseIndex + 20}, $${baseIndex + 21}, $${baseIndex + 22}, $${baseIndex + 23}, $${baseIndex + 24}, $${baseIndex + 25}, $${baseIndex + 26}, $${baseIndex + 27}, $${baseIndex + 28}, $${baseIndex + 29}, $${baseIndex + 30}, $${baseIndex + 31}, $${baseIndex + 32}, $${baseIndex + 33}, $${baseIndex + 34}, $${baseIndex + 35}, $${baseIndex + 36}, $${baseIndex + 37}, $${baseIndex + 38}, $${baseIndex + 39}, $${baseIndex + 40}, $${baseIndex + 41}, $${baseIndex + 42}, $${baseIndex + 43}, $${baseIndex + 44}, $${baseIndex + 45}, $${baseIndex + 46}, $${baseIndex + 47}, $${baseIndex + 48}, $${baseIndex + 49}, $${baseIndex + 50}, $${baseIndex + 51}, $${baseIndex + 52}, $${baseIndex + 53}, $${baseIndex + 54}, $${baseIndex + 55}, $${baseIndex + 56}, $${baseIndex + 57}, $${baseIndex + 58}, $${baseIndex + 59}, $${baseIndex + 60}, $${baseIndex + 61}, $${baseIndex + 62}, $${baseIndex + 63}, $${baseIndex + 64}, $${baseIndex + 65}, $${baseIndex + 66}, $${baseIndex + 67}, $${baseIndex + 68}, $${baseIndex + 69}, $${baseIndex + 70}, $${baseIndex + 71}, $${baseIndex + 72}, $${baseIndex + 73}, $${baseIndex + 74}, $${baseIndex + 75}, $${baseIndex + 76}, $${baseIndex + 77}, $${baseIndex + 78}, $${baseIndex + 79}, $${baseIndex + 80}, $${baseIndex + 81}, $${baseIndex + 82}, $${baseIndex + 83}, $${baseIndex + 84}, $${baseIndex + 85}, $${baseIndex + 86}, $${baseIndex + 87}, $${baseIndex + 88}, $${baseIndex + 89}, $${baseIndex + 90}, $${baseIndex + 91}, $${baseIndex + 92}, $${baseIndex + 93}, $${baseIndex + 94}, $${baseIndex + 95}, $${baseIndex + 96}, $${baseIndex + 97}, $${baseIndex + 98}, $${baseIndex + 99}, $${baseIndex + 100}, $${baseIndex + 101}, $${baseIndex + 102}, $${baseIndex + 103}, $${baseIndex + 104}, $${baseIndex + 105}, $${baseIndex + 106}, $${baseIndex + 107}, $${baseIndex + 108})`);
        
        values.push(
          row['observation_id'] || null,
          row['scientific_name'] || null,
          row['common_name'] || null,
          row['kingdom'] || null,
          row['phylum'] || null,
          row['class'] || null,
          row['order'] || null,
          row['family'] || null,
          row['genus'] || null,
          row['specific_epithet'] || null,
          row['infraspecific_epithet'] || null,
          row['taxon_rank'] || null,
          row['identified_by'] || null,
          row['date_identified'] || null,
          row['identification_references'] || null,
          row['identification_remarks'] || null,
          row['taxon_remarks'] || null,
          row['identification_qualifier'] || null,
          row['type_status'] || null,
          row['recorded_by'] || null,
          row['recorded_by_id'] || null,
          row['associated_collectors'] || null,
          row['record_number'] || null,
          row['individual_count'] || null,
          row['organism_quantity'] || null,
          row['organism_quantity_type'] || null,
          row['sex'] || null,
          row['life_stage'] || null,
          row['reproductive_condition'] || null,
          row['behavior'] || null,
          row['establishment_means'] || null,
          row['degree_of_establishment'] || null,
          row['pathway'] || null,
          row['occurrence_status'] || null,
          row['preparations'] || null,
          row['disposition'] || null,
          row['other_catalog_numbers'] || null,
          row['associated_occurrences'] || null,
          row['associated_organisms'] || null,
          row['associated_taxa'] || null,
          row['relationship_according_to'] || null,
          row['relationship_established_date'] || null,
          row['relationship_remarks'] || null,
          row['occurrence_remarks'] || null,
          row['catalog_number'] || null,
          row['record_entered_by'] || null,
          row['date_last_modified'] || null,
          row['institution_id'] || null,
          row['collection_id'] || null,
          row['dataset_id'] || null,
          row['institution_code'] || null,
          row['collection_code'] || null,
          row['dataset_name'] || null,
          row['owner_institution_code'] || null,
          row['basis_of_record'] || null,
          row['information_withheld'] || null,
          row['data_generalizations'] || null,
          row['dynamic_properties'] || null,
          row['locality_id'] || null,
          row['continent'] || null,
          row['water_body'] || null,
          row['island_group'] || null,
          row['island'] || null,
          row['country'] || null,
          row['country_code'] || null,
          row['state_province'] || null,
          row['county'] || null,
          row['municipality'] || null,
          row['locality'] || null,
          row['location_according_to'] || null,
          row['location_remarks'] || null,
          typeof row['decimal_latitude'] === 'number' ? row['decimal_latitude'] : null,
          typeof row['decimal_longitude'] === 'number' ? row['decimal_longitude'] : null,
          row['geodetic_datum'] || null,
          typeof row['coordinate_uncertainty_in_meters'] === 'number' ? row['coordinate_uncertainty_in_meters'] : null,
          row['coordinate_precision'] || null,
          row['point_radius_spatial_fit'] || null,
          row['verbatim_coordinates'] || null,
          row['verbatim_latitude'] || null,
          row['verbatim_longitude'] || null,
          row['verbatim_coordinate_system'] || null,
          row['verbatim_srs'] || null,
          row['footprint_wkt'] || null,
          row['footprint_srs'] || null,
          row['footprint_spatial_fit'] || null,
          row['georeferenced_by'] || null,
          row['georeferenced_date'] || null,
          row['georeferenced_protocol'] || null,
          row['georeferenced_sources'] || null,
          row['georeferenced_remarks'] || null,
          row['minimum_elevation_in_meters'] || null,
          row['maximum_elevation_in_meters'] || null,
          row['minimum_distance_above_surface_in_meters'] || null,
          row['maximum_distance_above_surface_in_meters'] || null,
          row['minimum_depth_in_meters'] || null,
          row['maximum_depth_in_meters'] || null,
          row['verbatim_depth'] || null,
          row['verbatim_elevation'] || null,
          row['habitat'] || null,
          row['substrate'] || null,
          row['field_notes'] || null,
          row['field_number'] || null,
          row['event_date'] || null,
          row['event_time'] || null,
          row['start_day_of_year'] || null,
          row['end_day_of_year'] || null,
          row['year'] || null,
          row['month'] || null,
          row['day'] || null,
          row['verbatim_event_date'] || null,
          row['sampling_protocol'] || null,
          row['sampling_effort'] || null,
          row['event_remarks'] || null,
          row['source'] || null,
          row['url'] || null,
          row['image_url'] || null,
          row['dna_sequence_url'] || null,
          row['trace_file_url'] || null,
          new Date()
        );
      });
      
      const insertSQL = `
        INSERT INTO observations (
          observation_id, scientific_name, common_name, kingdom, phylum, class, "order", family, genus, specific_epithet,
          infraspecific_epithet, taxon_rank, identified_by, date_identified, identification_references, identification_remarks,
          taxon_remarks, identification_qualifier, type_status, recorded_by, recorded_by_id, associated_collectors,
          record_number, individual_count, organism_quantity, organism_quantity_type, sex, life_stage, reproductive_condition,
          behavior, establishment_means, degree_of_establishment, pathway, occurrence_status, preparations, disposition,
          other_catalog_numbers, associated_occurrences, associated_organisms, associated_taxa, relationship_according_to,
          relationship_established_date, relationship_remarks, occurrence_remarks, catalog_number, record_entered_by,
          date_last_modified, institution_id, collection_id, dataset_id, institution_code, collection_code, dataset_name,
          owner_institution_code, basis_of_record, information_withheld, data_generalizations, dynamic_properties,
          locality_id, continent, water_body, island_group, island, country, country_code, state_province, county,
          municipality, locality, location_according_to, location_remarks, decimal_latitude, decimal_longitude,
          geodetic_datum, coordinate_uncertainty_in_meters, coordinate_precision, point_radius_spatial_fit,
          verbatim_coordinates, verbatim_latitude, verbatim_longitude, verbatim_coordinate_system, verbatim_srs,
          footprint_wkt, footprint_srs, footprint_spatial_fit, georeferenced_by, georeferenced_date,
          georeferenced_protocol, georeferenced_sources, georeferenced_remarks, minimum_elevation_in_meters,
          maximum_elevation_in_meters, minimum_distance_above_surface_in_meters, maximum_distance_above_surface_in_meters,
          minimum_depth_in_meters, maximum_depth_in_meters, verbatim_depth, verbatim_elevation, habitat, substrate,
          field_notes, field_number, event_date, event_time, start_day_of_year, end_day_of_year,
          year, month, day, verbatim_event_date, sampling_protocol, sampling_effort, event_remarks, source, url,
          image_url, dna_sequence_url, trace_file_url, created_at
        ) VALUES ${placeholders.join(', ')}
      `;
      
      await pool.query(insertSQL, values);
      totalProcessed += batch.length;
      
      console.log(`Processed batch ${Math.floor(i/batchSize) + 1}, total: ${totalProcessed}`);
    }
    
    console.log(`Successfully restored ${totalProcessed} observations!`);
    
    // Verify the restoration
    const result = await pool.query('SELECT COUNT(*) as count FROM observations');
    console.log(`Final verification: ${result.rows[0].count} observations in database`);
    
  } catch (error) {
    console.error('Restoration failed:', error);
  } finally {
    await pool.end();
  }
}

sqlRestore();