import pandas as pd
import psycopg2
import os
from datetime import datetime
import numpy as np

def safe_str(val):
    if pd.isna(val) or val is None:
        return None
    return str(val).strip() if str(val).strip() else None

def safe_float(val):
    if pd.isna(val) or val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def safe_date(val):
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    try:
        return pd.to_datetime(val).date()
    except:
        return None

def restore_dataset():
    print("Starting complete dataset restoration...")
    
    # Database connection
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        print("Clearing existing data...")
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print(f"Loading Excel file: {excel_path}")
        
        df = pd.read_excel(excel_path)
        print(f"Loaded {len(df)} rows from Excel")
        
        # Process observations in batches
        batch_size = 1000
        total_inserted = 0
        
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            
            observations = []
            for _, row in batch.iterrows():
                obs = (
                    safe_str(row.get('observation_id')),
                    safe_str(row.get('scientific_name')),
                    safe_str(row.get('common_name')),
                    safe_str(row.get('kingdom')),
                    safe_str(row.get('phylum')),
                    safe_str(row.get('class')),
                    safe_str(row.get('order')),
                    safe_str(row.get('family')),
                    safe_str(row.get('genus')),
                    safe_str(row.get('specific_epithet')),
                    safe_str(row.get('infraspecific_epithet')),
                    safe_str(row.get('taxon_rank')),
                    safe_str(row.get('identified_by')),
                    safe_date(row.get('date_identified')),
                    safe_str(row.get('identification_references')),
                    safe_str(row.get('identification_remarks')),
                    safe_str(row.get('taxon_remarks')),
                    safe_str(row.get('identification_qualifier')),
                    safe_str(row.get('type_status')),
                    safe_str(row.get('recorded_by')),
                    safe_str(row.get('recorded_by_id')),
                    safe_str(row.get('associated_collectors')),
                    safe_str(row.get('record_number')),
                    safe_str(row.get('individual_count')),
                    safe_str(row.get('organism_quantity')),
                    safe_str(row.get('organism_quantity_type')),
                    safe_str(row.get('sex')),
                    safe_str(row.get('life_stage')),
                    safe_str(row.get('reproductive_condition')),
                    safe_str(row.get('behavior')),
                    safe_str(row.get('establishment_means')),
                    safe_str(row.get('degree_of_establishment')),
                    safe_str(row.get('pathway')),
                    safe_str(row.get('occurrence_status')),
                    safe_str(row.get('preparations')),
                    safe_str(row.get('disposition')),
                    safe_str(row.get('other_catalog_numbers')),
                    safe_str(row.get('associated_occurrences')),
                    safe_str(row.get('associated_organisms')),
                    safe_str(row.get('associated_taxa')),
                    safe_str(row.get('relationship_according_to')),
                    safe_str(row.get('relationship_established_date')),
                    safe_str(row.get('relationship_remarks')),
                    safe_str(row.get('occurrence_remarks')),
                    safe_str(row.get('catalog_number')),
                    safe_str(row.get('record_entered_by')),
                    safe_date(row.get('date_last_modified')),
                    safe_str(row.get('institution_id')),
                    safe_str(row.get('collection_id')),
                    safe_str(row.get('dataset_id')),
                    safe_str(row.get('institution_code')),
                    safe_str(row.get('collection_code')),
                    safe_str(row.get('dataset_name')),
                    safe_str(row.get('owner_institution_code')),
                    safe_str(row.get('basis_of_record')),
                    safe_str(row.get('information_withheld')),
                    safe_str(row.get('data_generalizations')),
                    safe_str(row.get('dynamic_properties')),
                    safe_str(row.get('locality_id')),
                    safe_str(row.get('continent')),
                    safe_str(row.get('water_body')),
                    safe_str(row.get('island_group')),
                    safe_str(row.get('island')),
                    safe_str(row.get('country')),
                    safe_str(row.get('country_code')),
                    safe_str(row.get('state_province')),
                    safe_str(row.get('county')),
                    safe_str(row.get('municipality')),
                    safe_str(row.get('locality')),
                    safe_str(row.get('location_according_to')),
                    safe_str(row.get('location_remarks')),
                    safe_float(row.get('decimal_latitude')),
                    safe_float(row.get('decimal_longitude')),
                    safe_str(row.get('geodetic_datum')),
                    safe_float(row.get('coordinate_uncertainty_in_meters')),
                    safe_str(row.get('coordinate_precision')),
                    safe_str(row.get('point_radius_spatial_fit')),
                    safe_str(row.get('verbatim_coordinates')),
                    safe_str(row.get('verbatim_latitude')),
                    safe_str(row.get('verbatim_longitude')),
                    safe_str(row.get('verbatim_coordinate_system')),
                    safe_str(row.get('verbatim_srs')),
                    safe_str(row.get('footprint_wkt')),
                    safe_str(row.get('footprint_srs')),
                    safe_str(row.get('footprint_spatial_fit')),
                    safe_str(row.get('georeferenced_by')),
                    safe_date(row.get('georeferenced_date')),
                    safe_str(row.get('georeferenced_protocol')),
                    safe_str(row.get('georeferenced_sources')),
                    safe_str(row.get('georeferenced_remarks')),
                    safe_str(row.get('minimum_elevation_in_meters')),
                    safe_str(row.get('maximum_elevation_in_meters')),
                    safe_str(row.get('minimum_distance_above_surface_in_meters')),
                    safe_str(row.get('maximum_distance_above_surface_in_meters')),
                    safe_str(row.get('minimum_depth_in_meters')),
                    safe_str(row.get('maximum_depth_in_meters')),
                    safe_str(row.get('verbatim_depth')),
                    safe_str(row.get('verbatim_elevation')),
                    safe_str(row.get('habitat')),
                    safe_str(row.get('substrate')),
                    safe_str(row.get('associated_taxa')),
                    safe_str(row.get('field_notes')),
                    safe_str(row.get('field_number')),
                    safe_date(row.get('event_date')),
                    safe_str(row.get('event_time')),
                    safe_date(row.get('start_day_of_year')),
                    safe_date(row.get('end_day_of_year')),
                    safe_str(row.get('year')),
                    safe_str(row.get('month')),
                    safe_str(row.get('day')),
                    safe_str(row.get('verbatim_event_date')),
                    safe_str(row.get('sampling_protocol')),
                    safe_str(row.get('sampling_effort')),
                    safe_str(row.get('event_remarks')),
                    safe_str(row.get('source')),
                    safe_str(row.get('url')),
                    safe_str(row.get('image_url')),
                    safe_str(row.get('dna_sequence_url')),
                    safe_str(row.get('trace_file_url')),
                    datetime.now()  # created_at
                )
                observations.append(obs)
            
            # Insert batch
            insert_sql = """
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
                    associated_taxa, field_notes, field_number, event_date, event_time, start_day_of_year, end_day_of_year,
                    year, month, day, verbatim_event_date, sampling_protocol, sampling_effort, event_remarks, source, url,
                    image_url, dna_sequence_url, trace_file_url, created_at
                ) VALUES %s
            """
            
            from psycopg2.extras import execute_values
            execute_values(cursor, insert_sql, observations, template=None, page_size=1000)
            conn.commit()
            
            total_inserted += len(observations)
            print(f"Inserted batch {i//batch_size + 1}, total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations")
        
    except Exception as e:
        print(f"Error during restoration: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    restore_dataset()