import pandas as pd
import psycopg2
import os
from datetime import datetime

def quick_restore():
    print("Quick restoration with essential columns only...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel with only essential columns to speed up processing
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read Excel in chunks to handle memory efficiently
        chunk_iter = pd.read_excel(excel_path, chunksize=500, engine='openpyxl')
        
        total_inserted = 0
        
        for chunk_num, chunk in enumerate(chunk_iter):
            print(f"Processing chunk {chunk_num + 1}...")
            
            for _, row in chunk.iterrows():
                try:
                    # Extract essential fields only
                    ref_num = row.get('Reference Number')
                    genus = str(row.get('Genus', '')) if pd.notna(row.get('Genus')) else ''
                    species = str(row.get('Species', '')) if pd.notna(row.get('Species')) else ''
                    
                    # Build scientific name
                    scientific_name = f"{genus} {species}".strip() if genus and species else None
                    
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
                        float(row.get('Latitude')) if pd.notna(row.get('Latitude')) else None,
                        float(row.get('Longitude')) if pd.notna(row.get('Longitude')) else None,
                        'Excel Import',
                        datetime.now()
                    ))
                    total_inserted += 1
                    
                except Exception as e:
                    continue
            
            conn.commit()
            print(f"Chunk {chunk_num + 1} complete, total: {total_inserted}")
            
            # Break after processing a reasonable amount for testing
            if total_inserted >= 10000:
                print("Stopping at 10,000 records for initial test...")
                break
        
        print(f"Restored {total_inserted} observations!")
        
        # Verify
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database count: {count}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    quick_restore()