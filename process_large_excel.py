import pandas as pd
import psycopg2
import os
from datetime import datetime
import numpy as np

def process_large_excel(file_path=None):
    try:
        print("=== PROCESSING LARGE EXCEL DATASET ===")
        
        # Database connection with retry logic
        db_url = os.environ.get('DATABASE_URL')
        if not db_url:
            print("ERROR: DATABASE_URL not found in environment")
            return
        
        # Add connection parameters for stability
        conn = psycopg2.connect(db_url, 
                               connect_timeout=30,
                               keepalives=1,
                               keepalives_idle=30,
                               keepalives_interval=10,
                               keepalives_count=5)
        cursor = conn.cursor()
        
        # Clear existing data
        print("Clearing existing data...")
        cursor.execute("DELETE FROM observations")
        cursor.execute("DELETE FROM contributors") 
        cursor.execute("DELETE FROM species")
        conn.commit()
        print("✓ Data cleared")
        
        # Read Excel file
        print("Reading Excel file...")
        excel_file = file_path if file_path else './attached_assets/Validated Observations05.30.25.xlsx'
        
        # Read in chunks to handle large file
        chunk_size = 1000
        total_processed = 0
        name_updates = 0
        classification_updates = 0
        
        # Read the entire file first to get total count
        df = pd.read_excel(excel_file)
        total_rows = len(df)
        print(f"Total records to process: {total_rows}")
        
        # Process in chunks
        for chunk_start in range(0, total_rows, chunk_size):
            chunk_end = min(chunk_start + chunk_size, total_rows)
            chunk_df = df.iloc[chunk_start:chunk_end]
            
            print(f"Processing chunk {chunk_start//chunk_size + 1}/{(total_rows-1)//chunk_size + 1} (rows {chunk_start+1}-{chunk_end})")
            
            batch_data = []
            seen_keys = set()  # Track duplicates within batch
            
            for _, row in chunk_df.iterrows():
                # Build scientific name
                scientific_name = ''
                if pd.notna(row.get('Variety')):
                    scientific_name = str(row['Variety'])
                elif pd.notna(row.get('Species')):
                    scientific_name = str(row['Species'])
                elif pd.notna(row.get('Genus')):
                    scientific_name = str(row['Genus'])
                elif pd.notna(row.get('Family')):
                    scientific_name = str(row['Family'])
                elif pd.notna(row.get('Order')):
                    scientific_name = str(row['Order'])
                elif pd.notna(row.get('Class')):
                    scientific_name = str(row['Class'])
                elif pd.notna(row.get('Phylum')):
                    scientific_name = str(row['Phylum'])
                elif pd.notna(row.get('Kingdom')):
                    scientific_name = str(row['Kingdom'])
                else:
                    scientific_name = 'Unknown'
                
                # Validation flags
                name_update = pd.isna(row.get('Species')) and pd.isna(row.get('Variety'))
                has_species_or_variety = pd.notna(row.get('Species')) or pd.notna(row.get('Variety'))
                missing_higher_taxonomy = has_species_or_variety and (
                    pd.isna(row.get('Kingdom')) or pd.isna(row.get('Phylum')) or 
                    pd.isna(row.get('Class')) or pd.isna(row.get('Order')) or 
                    pd.isna(row.get('Family')) or pd.isna(row.get('Genus'))
                )
                classification_update = missing_higher_taxonomy
                
                if name_update:
                    name_updates += 1
                if classification_update:
                    classification_updates += 1
                
                # Convert data types safely
                def safe_float(val):
                    try:
                        return float(val) if pd.notna(val) and val != '' else None
                    except:
                        return None
                
                def safe_date(val):
                    try:
                        if pd.notna(val) and val != '':
                            return pd.to_datetime(val).date()
                        return None
                    except:
                        return None
                
                def safe_str(val):
                    return str(val) if pd.notna(val) and val != '' else None
                
                def safe_bool(val):
                    if pd.isna(val):
                        return False
                    return str(val).upper() in ['TRUE', 'YES', '1', 'Y']
                
                observation_data = (
                    safe_str(row.get('Reference Number', '')),  # observation_id
                    scientific_name,  # scientific_name
                    None,  # common_name
                    safe_str(row.get('Phylum')),  # phylum
                    safe_str(row.get('Class')),  # class
                    safe_str(row.get('Order')),  # order
                    safe_str(row.get('Family')),  # family
                    safe_str(row.get('Genus')),  # genus
                    safe_str(row.get('Species')),  # species
                    safe_str(row.get('Variety')),  # infraspecies
                    safe_str(row.get('Authority')),  # authority
                    safe_str(row.get('Abbreviated Authority')),  # abbreviated_authority
                    safe_str(row.get('Mycobank #')),  # mycobank_number
                    safe_str(row.get('Fungarium Specimen')),  # fungarium_specimen
                    safe_str(row.get('Images')),  # images
                    safe_str(row.get('GenBank Accession #')),  # genbank_accession
                    safe_str(row.get('MyCoPortal #')),  # mycoportal_number
                    safe_str(row.get('DNA Sequence')),  # dna_sequence
                    safe_str(row.get('Sequence')),  # sequence
                    safe_str(row.get('Flags')),  # flags
                    safe_str(row.get('Forward Primer')),  # forward_primer
                    safe_str(row.get('Reverse Primer')),  # reverse_primer
                    safe_str(row.get('Run Name')),  # run_name
                    safe_str(row.get('Sequence #2')),  # sequence_2
                    safe_str(row.get('Forward Primer #2')),  # forward_primer_2
                    safe_str(row.get('Reverse Primer #2')),  # reverse_primer_2
                    safe_str(row.get('Sequence Owner #2')),  # sequence_owner_2
                    safe_str(row.get('Run Name #2')),  # run_name_2
                    safe_str(row.get('Location Name')),  # location_name
                    safe_str(row.get('Country')),  # country
                    safe_str(row.get('State')),  # state
                    safe_float(row.get('Latitude')),  # latitude
                    safe_float(row.get('Longitude')),  # longitude
                    safe_date(row.get('Report Date')),  # observed_on
                    safe_date(row.get('Creation Date')),  # creation_date
                    safe_str(row.get('Collector')),  # collector
                    safe_str(row.get('Verified')),  # verified
                    safe_str(row.get('Notes')),  # notes
                    safe_str(row.get('MO Notes')),  # mo_notes
                    safe_str(row.get('Report Link')),  # report_link
                    safe_str(row.get('Image Link')),  # image_link
                    safe_bool(row.get('First GenBank Record')),  # first_genbank_record
                    safe_bool(row.get('Multiple Genotypes Under Name')),  # has_multiple_genotypes
                    name_update,  # name_update
                    classification_update,  # classification_update
                    safe_str(row.get('Source Database', 'Unknown')),  # source
                    safe_str(row.get('Collection Number')),  # collection_number
                    safe_bool(row.get('First State Record')),  # is_first_state_record
                    datetime.now(),  # created_at
                    datetime.now()   # updated_at
                )
                
                # Check for duplicates within this batch
                obs_id = safe_str(row.get('Reference Number', ''))
                source = safe_str(row.get('Source Database', 'Unknown'))
                key = (source, obs_id)
                
                if key not in seen_keys:
                    seen_keys.add(key)
                    batch_data.append(observation_data)
                else:
                    print(f"  Skipping duplicate: {source} - {obs_id}")
            
            # Insert batch
            insert_query = """
                INSERT INTO observations (
                    observation_id, scientific_name, common_name, phylum, class, "order", family, genus, species, infraspecies,
                    authority, abbreviated_authority, mycobank_number, fungarium_specimen, images, genbank_accession,
                    mycoportal_number, dna_sequence, sequence, flags, forward_primer, reverse_primer, run_name,
                    sequence_2, forward_primer_2, reverse_primer_2, sequence_owner_2, run_name_2, location_name, country, state,
                    latitude, longitude, observed_on, creation_date, collector, verified, notes, mo_notes, report_link, image_link,
                    first_genbank_record, has_multiple_genotypes, name_update, classification_update,
                    source, collection_number, is_first_state_record,
                    created_at, updated_at
                ) VALUES %s
                ON CONFLICT (source, observation_id) 
                DO UPDATE SET 
                    scientific_name = EXCLUDED.scientific_name,
                    updated_at = NOW()
            """
            
            try:
                from psycopg2.extras import execute_values
                execute_values(cursor, insert_query, batch_data, template=None, page_size=100)
                conn.commit()
                total_processed += len(batch_data)
                print(f"✓ Chunk inserted successfully. Total processed: {total_processed}")
            except Exception as e:
                print(f"✗ Error inserting chunk: {e}")
                conn.rollback()
                raise e
            
            # Progress update every 10 chunks
            if ((chunk_start // chunk_size) + 1) % 10 == 0:
                print(f"Progress milestone: {total_processed} records processed")
        
        print("=== PROCESSING COMPLETE ===")
        print(f"Total processed: {total_processed}")
        print(f"Name updates needed: {name_updates}")
        print(f"Classification updates needed: {classification_updates}")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"Processing failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import sys
    file_path = sys.argv[1] if len(sys.argv) > 1 else None
    process_large_excel(file_path)