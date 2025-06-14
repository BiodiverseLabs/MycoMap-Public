import pandas as pd
import psycopg2
import os
from datetime import datetime

def rapid_restore():
    print("Starting rapid restoration with optimized approach...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file with limited rows for quick restoration
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read first 25,000 rows to establish baseline dataset
        print("Reading Excel file (first 25,000 rows)...")
        df = pd.read_excel(excel_path, nrows=25000, engine='openpyxl')
        print(f"Loaded {len(df)} records from Excel")
        
        # Process in efficient batches using executemany
        batch_size = 2000
        total_inserted = 0
        
        for start_idx in range(0, len(df), batch_size):
            batch = df.iloc[start_idx:start_idx + batch_size]
            batch_data = []
            
            for _, row in batch.iterrows():
                try:
                    # Extract essential fields efficiently
                    ref_num = str(row.get('Reference Number', f'REF_{total_inserted}'))
                    genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                    species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                    
                    # Skip rows without genus
                    if not genus:
                        continue
                    
                    # Build scientific name
                    scientific_name = f"{genus} {species}" if species else genus
                    
                    # Extract coordinates with validation
                    lat = None
                    lon = None
                    if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                        try:
                            lat_val = float(row['Latitude'])
                            lon_val = float(row['Longitude'])
                            if -90 <= lat_val <= 90 and -180 <= lon_val <= 180:
                                lat, lon = lat_val, lon_val
                        except:
                            pass
                    
                    batch_data.append((
                        ref_num,
                        scientific_name,
                        genus,
                        species,
                        str(row.get('Collector', '')).strip() or None,
                        lat,
                        lon,
                        str(row.get('State', '')).strip() or None,
                        str(row.get('Country', '')).strip() or None,
                        str(row.get('GenBank Accession #', '')).strip() or None,
                        str(row.get('DNA Sequence', '')).strip() or None,
                        'Excel Import',
                        datetime.now()
                    ))
                    
                except Exception:
                    continue
            
            # Bulk insert using executemany
            if batch_data:
                cursor.executemany("""
                    INSERT INTO observations (
                        observation_id, scientific_name, genus, species, collector,
                        latitude, longitude, state, country, genbank_accession,
                        dna_sequence, source, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, batch_data)
                
                conn.commit()
                total_inserted += len(batch_data)
                print(f"Batch {start_idx//batch_size + 1} complete: {len(batch_data)} records, total: {total_inserted}")
        
        print(f"Rapid restoration completed: {total_inserted} observations restored")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        final_count = cursor.fetchone()[0]
        print(f"Database verification: {final_count} observations")
        
        # Display restoration statistics
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
        
        # Sample data verification
        cursor.execute("""
            SELECT observation_id, scientific_name, collector, state, latitude, longitude 
            FROM observations 
            WHERE scientific_name IS NOT NULL 
            ORDER BY observation_id 
            LIMIT 5
        """)
        samples = cursor.fetchall()
        print("\nSample restored data:")
        for sample in samples:
            coords = f"({sample[4]}, {sample[5]})" if sample[4] and sample[5] else "No coordinates"
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]} | {coords}")
        
    except Exception as e:
        print(f"Error during rapid restoration: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    rapid_restore()