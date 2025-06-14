import pandas as pd
import psycopg2
import os
from datetime import datetime

def chunk_restore():
    print("Starting chunked restoration...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Load and process Excel in chunks
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read Excel file in chunks to handle large file efficiently
        chunk_size = 1000
        total_processed = 0
        
        # Read the entire file first to get total count
        df = pd.read_excel(excel_path, engine='openpyxl')
        total_rows = len(df)
        print(f"Total rows to process: {total_rows}")
        
        # Process in smaller chunks
        for start_idx in range(0, total_rows, chunk_size):
            end_idx = min(start_idx + chunk_size, total_rows)
            chunk = df.iloc[start_idx:end_idx]
            
            # Insert chunk records individually to avoid complex batch issues
            for _, row in chunk.iterrows():
                try:
                    cursor.execute("""
                        INSERT INTO observations (
                            observation_id, scientific_name, common_name, kingdom, phylum, class, "order", 
                            family, genus, specific_epithet, recorded_by, state_province, country, 
                            decimal_latitude, decimal_longitude, event_date, source, url, image_url,
                            dna_sequence_url, trace_file_url, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        row.get('observation_id'),
                        row.get('scientific_name'),
                        row.get('common_name'),
                        row.get('kingdom'),
                        row.get('phylum'),
                        row.get('class'),
                        row.get('order'),
                        row.get('family'),
                        row.get('genus'),
                        row.get('specific_epithet'),
                        row.get('recorded_by'),
                        row.get('state_province'),
                        row.get('country'),
                        row.get('decimal_latitude') if pd.notna(row.get('decimal_latitude')) else None,
                        row.get('decimal_longitude') if pd.notna(row.get('decimal_longitude')) else None,
                        row.get('event_date'),
                        row.get('source'),
                        row.get('url'),
                        row.get('image_url'),
                        row.get('dna_sequence_url'),
                        row.get('trace_file_url'),
                        datetime.now()
                    ))
                    total_processed += 1
                except Exception as e:
                    print(f"Error inserting row {total_processed}: {e}")
                    continue
            
            conn.commit()
            print(f"Processed chunk {start_idx//chunk_size + 1}, records: {total_processed}")
        
        print(f"Successfully restored {total_processed} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Final verification: {count} observations in database")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    chunk_restore()