import pandas as pd
import psycopg2
import os
from datetime import datetime

def simple_data_restore():
    print("Starting simple data restoration...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Read small subset of Excel file for immediate restoration
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read just 5000 rows to get the platform functional quickly
        df = pd.read_excel(excel_path, nrows=5000, engine='openpyxl')
        print(f"Loaded {len(df)} records")
        
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        successful_inserts = 0
        
        # Process rows individually with robust error handling
        for index, row in df.iterrows():
            try:
                # Extract core data
                ref_num = str(row.get('Reference Number', f'REF_{index}'))
                genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                
                # Skip if no genus
                if not genus:
                    continue
                
                # Build scientific name
                scientific_name = f"{genus} {species}" if species else genus
                
                # Get other fields
                collector = str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None
                state = str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None
                country = str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None
                
                # Handle coordinates
                lat = None
                lon = None
                try:
                    if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                        lat_val = float(row['Latitude'])
                        lon_val = float(row['Longitude'])
                        if -90 <= lat_val <= 90 and -180 <= lon_val <= 180:
                            lat, lon = lat_val, lon_val
                except:
                    pass
                
                # Insert record
                cursor.execute("""
                    INSERT INTO observations (
                        observation_id, scientific_name, genus, species, collector,
                        latitude, longitude, state, country, source, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    ref_num, scientific_name, genus, species, collector,
                    lat, lon, state, country, 'Excel Import', datetime.now()
                ))
                
                successful_inserts += 1
                
                # Commit every 100 records
                if successful_inserts % 100 == 0:
                    conn.commit()
                    print(f"Inserted {successful_inserts} records...")
                
            except Exception as e:
                print(f"Error on row {index}: {e}")
                continue
        
        # Final commit
        conn.commit()
        print(f"Restoration completed: {successful_inserts} observations restored")
        
        # Verify
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database count: {count}")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT scientific_name) as species,
                COUNT(DISTINCT collector) as collectors,
                COUNT(DISTINCT state) as states,
                COUNT(*) FILTER (WHERE latitude IS NOT NULL) as with_coords
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"Stats - Total: {stats[0]}, Species: {stats[1]}, Collectors: {stats[2]}, States: {stats[3]}, With coords: {stats[4]}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    simple_data_restore()