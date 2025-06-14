import pandas as pd
import psycopg2
import os
from datetime import datetime

def minimal_restore():
    print("Starting minimal column restoration...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel with minimal columns for speed
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read only essential columns to minimize memory usage
        essential_cols = ['Reference Number', 'Genus', 'Species', 'Collector', 'State', 'Country']
        
        print("Reading Excel with essential columns only...")
        df = pd.read_excel(excel_path, usecols=essential_cols, nrows=15000, engine='openpyxl')
        print(f"Loaded {len(df)} records")
        
        # Insert records using simple batch processing
        batch_size = 500
        total_inserted = 0
        
        for start in range(0, len(df), batch_size):
            batch = df.iloc[start:start + batch_size]
            
            for _, row in batch.iterrows():
                try:
                    ref_num = str(row.get('Reference Number', f'REF_{total_inserted}'))
                    genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                    species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                    
                    # Build scientific name
                    if genus and species:
                        scientific_name = f"{genus} {species}"
                    elif genus:
                        scientific_name = genus
                    else:
                        scientific_name = 'Unknown'
                    
                    cursor.execute("""
                        INSERT INTO observations (
                            observation_id, scientific_name, genus, species, collector, 
                            state, country, source, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        ref_num,
                        scientific_name,
                        genus,
                        species,
                        str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None,
                        str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None,
                        str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None,
                        'Excel Import',
                        datetime.now()
                    ))
                    
                    total_inserted += 1
                    
                except Exception as e:
                    continue
            
            # Commit each batch
            conn.commit()
            print(f"Batch {start//batch_size + 1} complete: {total_inserted} total records")
        
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
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    minimal_restore()