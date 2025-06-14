import pandas as pd
import psycopg2
import os
from datetime import datetime

def corrected_restore():
    print("Starting corrected restoration...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        print("Cleared existing data")
        
        # Load Excel file
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print("Loading Excel file...")
        
        df = pd.read_excel(excel_path, engine='openpyxl')
        print(f"Loaded {len(df)} records")
        
        # Process in batches
        batch_size = 1000
        total_inserted = 0
        
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            print(f"Processing batch {i//batch_size + 1}...")
            
            for _, row in batch.iterrows():
                try:
                    # Extract and clean data
                    ref_num = row.get('Reference Number')
                    genus = str(row.get('Genus', '')) if pd.notna(row.get('Genus')) else ''
                    species = str(row.get('Species', '')) if pd.notna(row.get('Species')) else ''
                    
                    # Build scientific name
                    scientific_name = None
                    if genus and species:
                        scientific_name = f"{genus} {species}".strip()
                    
                    # Get coordinates
                    lat = row.get('Latitude')
                    lon = row.get('Longitude')
                    
                    try:
                        lat = float(lat) if pd.notna(lat) else None
                        lon = float(lon) if pd.notna(lon) else None
                    except:
                        lat, lon = None, None
                    
                    cursor.execute("""
                        INSERT INTO observations (
                            observation_id, scientific_name, genus, specific_epithet, 
                            recorded_by, state_province, country, decimal_latitude, 
                            decimal_longitude, source, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        str(ref_num) if pd.notna(ref_num) else None,
                        scientific_name,
                        genus if genus else None,
                        species if species else None,
                        str(row.get('Collector', '')) if pd.notna(row.get('Collector')) else None,
                        str(row.get('State', '')) if pd.notna(row.get('State')) else None,
                        str(row.get('Country', '')) if pd.notna(row.get('Country')) else None,
                        lat,
                        lon,
                        'Excel Import',
                        datetime.now()
                    ))
                    total_inserted += 1
                    
                except Exception as e:
                    continue
            
            conn.commit()
            print(f"Batch complete, total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show sample
        cursor.execute("SELECT observation_id, scientific_name, recorded_by, state_province FROM observations LIMIT 3")
        samples = cursor.fetchall()
        print("\nSample records:")
        for sample in samples:
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    corrected_restore()