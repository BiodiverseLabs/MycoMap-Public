import pandas as pd
import psycopg2
import os
from datetime import datetime

def direct_sql_restore():
    print("Starting direct SQL restoration...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        print("Cleared existing data")
        
        # Load Excel file with only essential columns
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read in smaller batches to avoid memory issues
        batch_size = 2000
        total_inserted = 0
        
        # Use pandas to read Excel file
        df = pd.read_excel(excel_path, engine='openpyxl')
        total_rows = len(df)
        print(f"Total rows in Excel: {total_rows}")
        
        # Process in batches
        for start_idx in range(0, min(total_rows, 20000), batch_size):  # Limit to first 20k for testing
            end_idx = min(start_idx + batch_size, total_rows)
            batch = df.iloc[start_idx:end_idx]
            
            print(f"Processing batch {start_idx//batch_size + 1}: rows {start_idx} to {end_idx}")
            
            # Prepare batch insert using execute_many
            batch_data = []
            
            for _, row in batch.iterrows():
                try:
                    # Extract essential fields
                    ref_num = str(row.get('Reference Number', '')) if pd.notna(row.get('Reference Number')) else None
                    genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                    species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                    
                    # Build scientific name
                    scientific_name = None
                    if genus and species:
                        scientific_name = f"{genus} {species}"
                    elif genus:
                        scientific_name = genus
                    
                    # Extract coordinates
                    lat = None
                    lon = None
                    if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                        try:
                            lat = float(row['Latitude'])
                            lon = float(row['Longitude'])
                            # Validate coordinate ranges
                            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                                lat, lon = None, None
                        except:
                            lat, lon = None, None
                    
                    batch_data.append((
                        ref_num,
                        scientific_name,
                        genus,
                        species,
                        str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None,
                        lat,
                        lon,
                        str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None,
                        str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None,
                        'Excel Import',
                        datetime.now()
                    ))
                    
                except Exception as e:
                    continue
            
            # Bulk insert batch
            if batch_data:
                cursor.executemany("""
                    INSERT INTO observations (
                        observation_id, scientific_name, genus, species, collector,
                        latitude, longitude, state, country, source, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, batch_data)
                
                conn.commit()
                total_inserted += len(batch_data)
                print(f"Inserted batch of {len(batch_data)} records. Total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show sample data
        cursor.execute("SELECT observation_id, scientific_name, collector, state FROM observations LIMIT 5")
        samples = cursor.fetchall()
        print("\nSample restored records:")
        for sample in samples:
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT scientific_name) as unique_species,
                COUNT(DISTINCT collector) as unique_collectors,
                COUNT(DISTINCT state) as unique_states,
                COUNT(*) FILTER (WHERE latitude IS NOT NULL) as with_coordinates
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"\nRestoration Statistics:")
        print(f"  Total observations: {stats[0]}")
        print(f"  Unique species: {stats[1]}")
        print(f"  Unique collectors: {stats[2]}")
        print(f"  Unique states: {stats[3]}")
        print(f"  With coordinates: {stats[4]}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    direct_sql_restore()