import pandas as pd
import psycopg2
import os
from datetime import datetime

def efficient_restore():
    print("Starting efficient restoration with minimal processing...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file with minimal columns first
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print("Loading Excel file with key columns only...")
        
        # Read only essential columns to speed up processing
        key_columns = ['Reference Number', 'Genus', 'Species', 'Collector', 'State', 'Country', 'Latitude', 'Longitude']
        
        # Process in very small chunks
        chunk_size = 1000
        total_inserted = 0
        
        # Read Excel in chunks
        with pd.ExcelFile(excel_path, engine='openpyxl') as xl:
            df = pd.read_excel(xl, usecols=key_columns, nrows=5000)  # Start with 5000 records
            
        print(f"Loaded {len(df)} records")
        
        for i in range(0, len(df), chunk_size):
            chunk = df.iloc[i:i+chunk_size]
            
            for _, row in chunk.iterrows():
                try:
                    ref_num = str(row.get('Reference Number', '')) if pd.notna(row.get('Reference Number')) else f"REF_{total_inserted}"
                    genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else ''
                    species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else ''
                    
                    scientific_name = f"{genus} {species}".strip() if genus and species else (genus or 'Unknown')
                    
                    # Extract coordinates safely
                    lat, lon = None, None
                    try:
                        if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                            lat = float(row['Latitude'])
                            lon = float(row['Longitude'])
                            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                                lat, lon = None, None
                    except:
                        lat, lon = None, None
                    
                    cursor.execute("""
                        INSERT INTO observations (
                            observation_id, scientific_name, genus, species, collector,
                            latitude, longitude, state, country, source, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
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
                    
                    total_inserted += 1
                    
                except Exception as e:
                    continue
            
            conn.commit()
            print(f"Chunk {i//chunk_size + 1} complete, total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show sample data
        cursor.execute("SELECT observation_id, scientific_name, collector, state FROM observations LIMIT 3")
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
    efficient_restore()