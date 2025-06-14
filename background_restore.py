import pandas as pd
import psycopg2
import os
from datetime import datetime
import time

def background_restore():
    print("Starting background restoration process...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear test data and prepare for real restoration
        cursor.execute("DELETE FROM observations WHERE observation_id LIKE 'RESTORE_%'")
        conn.commit()
        
        # Load Excel file efficiently
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Read Excel in smaller batches
        print("Loading Excel file in batches...")
        
        # Use pandas read_excel with iterator approach
        chunk_size = 1000
        total_processed = 0
        
        try:
            # Read the file once to get total size
            df_info = pd.read_excel(excel_path, nrows=0, engine='openpyxl')
            print("Excel file opened successfully")
            
            # Process in manageable chunks
            for chunk_start in range(0, 50000, chunk_size):  # Process first 50k records
                print(f"Processing chunk starting at row {chunk_start}")
                
                try:
                    chunk_df = pd.read_excel(
                        excel_path, 
                        skiprows=range(1, chunk_start + 1) if chunk_start > 0 else None,
                        nrows=chunk_size, 
                        engine='openpyxl'
                    )
                    
                    if chunk_df.empty:
                        print("Reached end of file")
                        break
                    
                    print(f"Processing {len(chunk_df)} records in current chunk")
                    
                    # Process each row in the chunk
                    batch_records = []
                    
                    for _, row in chunk_df.iterrows():
                        try:
                            # Extract key fields
                            ref_num = str(row.get('Reference Number', f'REF_{total_processed}'))
                            genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                            species_val = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                            
                            # Build scientific name
                            if genus and species_val:
                                scientific_name = f"{genus} {species_val}"
                            elif genus:
                                scientific_name = genus
                            else:
                                continue  # Skip records without genus
                            
                            batch_records.append((
                                ref_num,
                                scientific_name,
                                genus,
                                species_val,
                                str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None,
                                str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None,
                                str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None,
                                'Excel Import',
                                datetime.now()
                            ))
                            
                        except Exception as e:
                            continue
                    
                    # Bulk insert batch
                    if batch_records:
                        cursor.executemany("""
                            INSERT INTO observations (
                                observation_id, scientific_name, genus, species, collector,
                                state, country, source, created_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """, batch_records)
                        
                        conn.commit()
                        total_processed += len(batch_records)
                        print(f"Inserted {len(batch_records)} records. Total: {total_processed}")
                    
                    # Add small delay to prevent overwhelming the system
                    time.sleep(0.1)
                    
                except Exception as chunk_error:
                    print(f"Error processing chunk {chunk_start}: {chunk_error}")
                    continue
        
        except Exception as file_error:
            print(f"Error reading Excel file: {file_error}")
            return
        
        print(f"Background restoration completed: {total_processed} observations restored")
        
        # Verify final count
        cursor.execute("SELECT COUNT(*) FROM observations")
        final_count = cursor.fetchone()[0]
        print(f"Final database count: {final_count} observations")
        
        # Show sample data
        cursor.execute("""
            SELECT observation_id, scientific_name, collector, state 
            FROM observations 
            WHERE source = 'Excel Import' 
            LIMIT 5
        """)
        samples = cursor.fetchall()
        print("\nSample restored records:")
        for sample in samples:
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
        
    except Exception as e:
        print(f"Critical error in background restoration: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    background_restore()