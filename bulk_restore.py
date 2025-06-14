import pandas as pd
import psycopg2
import os
from datetime import datetime

def bulk_restore():
    print("Starting bulk restoration with memory-efficient processing...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load Excel file efficiently
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read Excel in smaller chunks to avoid memory issues
        print("Reading Excel file in chunks...")
        xl_file = pd.ExcelFile(excel_path, engine='openpyxl')
        df = xl_file.parse(xl_file.sheet_names[0])
        
        print(f"Total records: {len(df)}")
        
        # Prepare bulk insert using psycopg2's execute_values for efficiency
        from psycopg2.extras import execute_values
        
        # Process in chunks of 2000 records
        chunk_size = 2000
        total_inserted = 0
        
        for start_idx in range(0, len(df), chunk_size):
            end_idx = min(start_idx + chunk_size, len(df))
            chunk = df.iloc[start_idx:end_idx]
            
            # Prepare data for bulk insert
            records = []
            for _, row in chunk.iterrows():
                # Extract key fields
                ref_num = str(row.get('Reference Number', '')) if pd.notna(row.get('Reference Number')) else None
                genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else ''
                species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else ''
                
                # Build scientific name
                scientific_name = f"{genus} {species}".strip() if genus and species else None
                
                # Extract coordinates safely
                try:
                    lat = float(row.get('Latitude')) if pd.notna(row.get('Latitude')) else None
                    lon = float(row.get('Longitude')) if pd.notna(row.get('Longitude')) else None
                except (ValueError, TypeError):
                    lat, lon = None, None
                
                record = (
                    ref_num,
                    scientific_name,
                    genus if genus else None,
                    species if species else None,
                    str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None,
                    str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None,
                    str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None,
                    lat,
                    lon,
                    'Excel Import',
                    datetime.now()
                )
                records.append(record)
            
            # Bulk insert using execute_values
            execute_values(
                cursor,
                """
                INSERT INTO observations (
                    observation_id, scientific_name, genus, specific_epithet,
                    recorded_by, state_province, country, decimal_latitude,
                    decimal_longitude, source, created_at
                ) VALUES %s
                """,
                records,
                template=None,
                page_size=1000
            )
            
            conn.commit()
            total_inserted += len(records)
            print(f"Processed chunk {start_idx//chunk_size + 1}, total: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT scientific_name) as unique_species,
                COUNT(DISTINCT recorded_by) as unique_collectors,
                COUNT(DISTINCT state_province) as unique_states
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"Statistics - Total: {stats[0]}, Species: {stats[1]}, Collectors: {stats[2]}, States: {stats[3]}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    bulk_restore()