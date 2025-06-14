import pandas as pd
import psycopg2
import os
from datetime import datetime

def schema_matched_restore():
    print("Starting restoration with proper schema mapping...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print("Loading Excel file...")
        
        # Read first 10000 records for initial restoration
        df = pd.read_excel(excel_path, nrows=10000, engine='openpyxl')
        print(f"Loaded {len(df)} records for restoration")
        
        successful_inserts = 0
        
        for index, row in df.iterrows():
            try:
                # Map Excel columns to database schema
                ref_num = str(row['Reference Number']) if pd.notna(row.get('Reference Number')) else f"REF_{index}"
                genus = str(row['Genus']).strip() if pd.notna(row.get('Genus')) else ''
                species_val = str(row['Species']).strip() if pd.notna(row.get('Species')) else ''
                
                # Build scientific name from genus and species
                if genus and species_val:
                    scientific_name = f"{genus} {species_val}"
                elif genus:
                    scientific_name = genus
                else:
                    scientific_name = 'Unknown'
                
                # Extract coordinates
                lat, lon = None, None
                if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                    try:
                        lat = float(row['Latitude'])
                        lon = float(row['Longitude'])
                        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                            lat, lon = None, None
                    except (ValueError, TypeError):
                        lat, lon = None, None
                
                # Parse date
                observed_date = None
                if pd.notna(row.get('Report Date')):
                    try:
                        observed_date = pd.to_datetime(row['Report Date']).date()
                    except:
                        pass
                
                cursor.execute("""
                    INSERT INTO observations (
                        observation_id, scientific_name, genus, species, collector, 
                        latitude, longitude, state, country, source, observed_on, 
                        genbank_accession, dna_sequence, sequence, collection_number,
                        verified, kingdom, authority, mycobank_number, notes,
                        report_link, image_link, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    ref_num,
                    scientific_name,
                    genus if genus else None,
                    species_val if species_val else None,
                    str(row['Collector']).strip() if pd.notna(row.get('Collector')) else None,
                    lat,
                    lon,
                    str(row['State']).strip() if pd.notna(row.get('State')) else None,
                    str(row['Country']).strip() if pd.notna(row.get('Country')) else None,
                    str(row['Source Database']).strip() if pd.notna(row.get('Source Database')) else 'Excel Import',
                    observed_date,
                    str(row['GenBank Accession #']).strip() if pd.notna(row.get('GenBank Accession #')) else None,
                    str(row['DNA Sequence']).strip() if pd.notna(row.get('DNA Sequence')) else None,
                    str(row['Sequence']).strip() if pd.notna(row.get('Sequence')) else None,
                    str(row['Collection Number']).strip() if pd.notna(row.get('Collection Number')) else None,
                    str(row['Verified']).strip() if pd.notna(row.get('Verified')) else None,
                    str(row['Kingdom']).strip() if pd.notna(row.get('Kingdom')) else None,
                    str(row['Authority']).strip() if pd.notna(row.get('Authority')) else None,
                    str(row['Mycobank #']).strip() if pd.notna(row.get('Mycobank #')) else None,
                    str(row['Notes']).strip() if pd.notna(row.get('Notes')) else None,
                    str(row['Report Link']).strip() if pd.notna(row.get('Report Link')) else None,
                    str(row['Image Link']).strip() if pd.notna(row.get('Image Link')) else None,
                    datetime.now()
                ))
                
                successful_inserts += 1
                
                if successful_inserts % 500 == 0:
                    conn.commit()
                    print(f"Inserted {successful_inserts} records...")
                
            except Exception as e:
                print(f"Error inserting record {index}: {e}")
                conn.rollback()
                continue
        
        # Final commit
        conn.commit()
        print(f"Successfully restored {successful_inserts} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show sample data
        cursor.execute("""
            SELECT observation_id, scientific_name, collector, state, latitude, longitude 
            FROM observations 
            WHERE scientific_name IS NOT NULL 
            LIMIT 5
        """)
        samples = cursor.fetchall()
        print("\nSample restored records:")
        for sample in samples:
            print(f"  ID: {sample[0]} | Species: {sample[1]} | Collector: {sample[2]} | State: {sample[3]} | Coords: {sample[4]}, {sample[5]}")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT scientific_name) as unique_species,
                COUNT(DISTINCT collector) as unique_collectors,
                COUNT(DISTINCT state) as unique_states,
                COUNT(*) FILTER (WHERE latitude IS NOT NULL) as with_coordinates,
                COUNT(*) FILTER (WHERE genbank_accession IS NOT NULL) as with_genbank
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"\nRestoration Statistics:")
        print(f"  Total observations: {stats[0]}")
        print(f"  Unique species: {stats[1]}")
        print(f"  Unique collectors: {stats[2]}")
        print(f"  Unique states: {stats[3]}")
        print(f"  With coordinates: {stats[4]}")
        print(f"  With GenBank data: {stats[5]}")
        
    except Exception as e:
        print(f"Critical error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    schema_matched_restore()