import pandas as pd
import psycopg2
import os
from datetime import datetime

def sql_direct_restore():
    print("Starting direct SQL restoration...")
    
    # Connect to database
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file - read only first 5000 rows for testing
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print("Loading Excel file...")
        
        # Read Excel with nrows parameter to limit initial load
        df = pd.read_excel(excel_path, nrows=5000, engine='openpyxl')
        print(f"Loaded {len(df)} records for restoration test")
        
        # Insert records individually with error handling
        successful_inserts = 0
        
        for index, row in df.iterrows():
            try:
                # Extract key fields with safe conversion
                ref_num = str(row['Reference Number']) if pd.notna(row.get('Reference Number')) else f"REF_{index}"
                genus = str(row['Genus']).strip() if pd.notna(row.get('Genus')) else ''
                species = str(row['Species']).strip() if pd.notna(row.get('Species')) else ''
                
                # Build scientific name
                if genus and species:
                    scientific_name = f"{genus} {species}"
                elif genus:
                    scientific_name = genus
                else:
                    scientific_name = 'Unknown'
                
                # Extract other fields
                collector = str(row['Collector']).strip() if pd.notna(row.get('Collector')) else None
                state = str(row['State']).strip() if pd.notna(row.get('State')) else None
                country = str(row['Country']).strip() if pd.notna(row.get('Country')) else None
                
                # Handle coordinates
                lat, lon = None, None
                if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                    try:
                        lat = float(row['Latitude'])
                        lon = float(row['Longitude'])
                        # Validate coordinate ranges
                        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                            lat, lon = None, None
                    except (ValueError, TypeError):
                        lat, lon = None, None
                
                cursor.execute("""
                    INSERT INTO observations (
                        observation_id, scientific_name, genus, specific_epithet,
                        recorded_by, state_province, country, decimal_latitude,
                        decimal_longitude, source, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    ref_num,
                    scientific_name,
                    genus if genus else None,
                    species if species else None,
                    collector,
                    state,
                    country,
                    lat,
                    lon,
                    'Excel Import',
                    datetime.now()
                ))
                
                successful_inserts += 1
                
                # Commit every 100 records
                if successful_inserts % 100 == 0:
                    conn.commit()
                    print(f"Inserted {successful_inserts} records...")
                
            except Exception as e:
                print(f"Error inserting record {index}: {e}")
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
            SELECT observation_id, scientific_name, recorded_by, state_province, decimal_latitude, decimal_longitude 
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
                COUNT(DISTINCT recorded_by) as unique_collectors,
                COUNT(DISTINCT state_province) as unique_states,
                COUNT(*) FILTER (WHERE decimal_latitude IS NOT NULL) as with_coordinates
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"\nStatistics:")
        print(f"  Total observations: {stats[0]}")
        print(f"  Unique species: {stats[1]}")
        print(f"  Unique collectors: {stats[2]}")
        print(f"  Unique states: {stats[3]}")
        print(f"  With coordinates: {stats[4]}")
        
    except Exception as e:
        print(f"Critical error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    sql_direct_restore()