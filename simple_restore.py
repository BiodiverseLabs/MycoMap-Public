import pandas as pd
import psycopg2
import os
from datetime import datetime

def restore_original_data():
    print("Starting restoration of original 70,000+ observations...")
    
    # Connect to database
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        print("Clearing existing data...")
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print(f"Loading {excel_path}...")
        
        # Read Excel with chunk processing to handle large file
        df = pd.read_excel(excel_path, engine='openpyxl')
        print(f"Loaded {len(df)} records from Excel file")
        
        # Insert data in batches
        batch_size = 100
        total_inserted = 0
        
        # Prepare insert statement with all columns
        insert_sql = """
        INSERT INTO observations (
            observation_id, scientific_name, common_name, kingdom, phylum, class, "order", family, genus, 
            specific_epithet, infraspecific_epithet, taxon_rank, identified_by, date_identified, 
            identification_references, identification_remarks, taxon_remarks, identification_qualifier, 
            type_status, recorded_by, recorded_by_id, associated_collectors, record_number, 
            individual_count, organism_quantity, organism_quantity_type, sex, life_stage, 
            reproductive_condition, behavior, establishment_means, degree_of_establishment, pathway, 
            occurrence_status, preparations, disposition, other_catalog_numbers, associated_occurrences, 
            associated_organisms, associated_taxa, relationship_according_to, relationship_established_date, 
            relationship_remarks, occurrence_remarks, catalog_number, record_entered_by, date_last_modified, 
            institution_id, collection_id, dataset_id, institution_code, collection_code, dataset_name, 
            owner_institution_code, basis_of_record, information_withheld, data_generalizations, 
            dynamic_properties, locality_id, continent, water_body, island_group, island, country, 
            country_code, state_province, county, municipality, locality, location_according_to, 
            location_remarks, decimal_latitude, decimal_longitude, geodetic_datum, 
            coordinate_uncertainty_in_meters, coordinate_precision, point_radius_spatial_fit, 
            verbatim_coordinates, verbatim_latitude, verbatim_longitude, verbatim_coordinate_system, 
            verbatim_srs, footprint_wkt, footprint_srs, footprint_spatial_fit, georeferenced_by, 
            georeferenced_date, georeferenced_protocol, georeferenced_sources, georeferenced_remarks, 
            minimum_elevation_in_meters, maximum_elevation_in_meters, minimum_distance_above_surface_in_meters, 
            maximum_distance_above_surface_in_meters, minimum_depth_in_meters, maximum_depth_in_meters, 
            verbatim_depth, verbatim_elevation, habitat, substrate, field_notes, field_number, 
            event_date, event_time, start_day_of_year, end_day_of_year, year, month, day, 
            verbatim_event_date, sampling_protocol, sampling_effort, event_remarks, source, url, 
            image_url, dna_sequence_url, trace_file_url, created_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, %s, %s
        )
        """
        
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            
            for _, row in batch.iterrows():
                # Prepare row data with safe conversion
                row_data = []
                for col in ['observation_id', 'scientific_name', 'common_name', 'kingdom', 'phylum', 
                           'class', 'order', 'family', 'genus', 'specific_epithet', 'infraspecific_epithet', 
                           'taxon_rank', 'identified_by', 'date_identified', 'identification_references', 
                           'identification_remarks', 'taxon_remarks', 'identification_qualifier', 'type_status', 
                           'recorded_by', 'recorded_by_id', 'associated_collectors', 'record_number', 
                           'individual_count', 'organism_quantity', 'organism_quantity_type', 'sex', 
                           'life_stage', 'reproductive_condition', 'behavior', 'establishment_means', 
                           'degree_of_establishment', 'pathway', 'occurrence_status', 'preparations', 
                           'disposition', 'other_catalog_numbers', 'associated_occurrences', 'associated_organisms', 
                           'associated_taxa', 'relationship_according_to', 'relationship_established_date', 
                           'relationship_remarks', 'occurrence_remarks', 'catalog_number', 'record_entered_by', 
                           'date_last_modified', 'institution_id', 'collection_id', 'dataset_id', 
                           'institution_code', 'collection_code', 'dataset_name', 'owner_institution_code', 
                           'basis_of_record', 'information_withheld', 'data_generalizations', 'dynamic_properties', 
                           'locality_id', 'continent', 'water_body', 'island_group', 'island', 'country', 
                           'country_code', 'state_province', 'county', 'municipality', 'locality', 
                           'location_according_to', 'location_remarks', 'decimal_latitude', 'decimal_longitude', 
                           'geodetic_datum', 'coordinate_uncertainty_in_meters', 'coordinate_precision', 
                           'point_radius_spatial_fit', 'verbatim_coordinates', 'verbatim_latitude', 
                           'verbatim_longitude', 'verbatim_coordinate_system', 'verbatim_srs', 'footprint_wkt', 
                           'footprint_srs', 'footprint_spatial_fit', 'georeferenced_by', 'georeferenced_date', 
                           'georeferenced_protocol', 'georeferenced_sources', 'georeferenced_remarks', 
                           'minimum_elevation_in_meters', 'maximum_elevation_in_meters', 
                           'minimum_distance_above_surface_in_meters', 'maximum_distance_above_surface_in_meters', 
                           'minimum_depth_in_meters', 'maximum_depth_in_meters', 'verbatim_depth', 
                           'verbatim_elevation', 'habitat', 'substrate', 'field_notes', 'field_number', 
                           'event_date', 'event_time', 'start_day_of_year', 'end_day_of_year', 'year', 
                           'month', 'day', 'verbatim_event_date', 'sampling_protocol', 'sampling_effort', 
                           'event_remarks', 'source', 'url', 'image_url', 'dna_sequence_url', 'trace_file_url']:
                    
                    value = row.get(col)
                    if pd.isna(value) or value is None:
                        row_data.append(None)
                    else:
                        row_data.append(str(value).strip() if str(value).strip() else None)
                
                # Add created_at timestamp
                row_data.append(datetime.now())
                
                cursor.execute(insert_sql, row_data)
            
            conn.commit()
            total_inserted += len(batch)
            print(f"Inserted batch {i//batch_size + 1}, total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Final verification: {count} observations in database")
        
    except Exception as e:
        print(f"Error during restoration: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    restore_original_data()