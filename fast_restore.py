import pandas as pd
import psycopg2
import os
from datetime import datetime

def fast_restore():
    print("Starting fast restoration with optimized processing...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        print("Database cleared")
        
        # Convert Excel to CSV first for faster processing
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        csv_path = "temp_data.csv"
        
        print("Converting Excel to CSV...")
        # Read only first 10k rows initially
        df = pd.read_excel(excel_path, nrows=10000, engine='openpyxl')
        df.to_csv(csv_path, index=False)
        print(f"Converted {len(df)} rows to CSV")
        
        # Now process CSV (much faster)
        chunk_size = 1000
        total_inserted = 0
        
        for chunk in pd.read_csv(csv_path, chunksize=chunk_size):
            batch_data = []
            
            for _, row in chunk.iterrows():
                try:
                    ref_num = str(row.get('Reference Number', '')) if pd.notna(row.get('Reference Number')) else f"REF_{total_inserted}"
                    genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else ''
                    species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else ''
                    
                    scientific_name = f"{genus} {species}".strip() if genus and species else (genus or 'Unknown')
                    
                    # Handle coordinates
                    lat = float(row.get('Latitude')) if pd.notna(row.get('Latitude')) else None
                    lon = float(row.get('Longitude')) if pd.notna(row.get('Longitude')) else None
                    
                    if lat and lon and (-90 <= lat <= 90) and (-180 <= lon <= 180):
                        pass  # Keep valid coordinates
                    else:
                        lat, lon = None, None
                    
                    batch_data.append((
                        ref_num,
                        scientific_name,
                        genus if genus else None,
                        species if species else None,
                        str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None,
                        lat,
                        lon,
                        str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None,
                        str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None,
                        'Excel Import',
                        datetime.now()
                    ))
                    
                except:
                    continue
            
            # Bulk insert
            if batch_data:
                cursor.executemany("""
                    INSERT INTO observations (
                        observation_id, scientific_name, genus, species, collector,
                        latitude, longitude, state, country, source, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, batch_data)
                
                total_inserted += len(batch_data)
                conn.commit()
                print(f"Inserted {len(batch_data)} records, total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT scientific_name) as species,
                COUNT(DISTINCT collector) as collectors,
                COUNT(DISTINCT state) as states
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"Statistics - Total: {stats[0]}, Species: {stats[1]}, Collectors: {stats[2]}, States: {stats[3]}")
        
        # Clean up temp file
        if os.path.exists(csv_path):
            os.remove(csv_path)
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    fast_restore()