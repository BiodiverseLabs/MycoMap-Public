import pandas as pd
import psycopg2
import os
from datetime import datetime

def final_efficient_restore():
    print("Starting efficient restoration of original dataset...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        print("Database cleared")
        
        # Load Excel file in manageable chunks
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        
        # Process the full file in chunks to handle the large size
        chunk_size = 5000
        total_processed = 0
        
        # Read the entire Excel file first to get total count
        print("Reading Excel file...")
        df = pd.read_excel(excel_path, engine='openpyxl')
        total_rows = len(df)
        print(f"Total rows in Excel: {total_rows}")
        
        # Process in chunks
        for start_idx in range(0, total_rows, chunk_size):
            end_idx = min(start_idx + chunk_size, total_rows)
            chunk = df.iloc[start_idx:end_idx]
            
            print(f"Processing chunk {start_idx//chunk_size + 1}: rows {start_idx}-{end_idx}")
            
            # Process each row in the chunk
            for _, row in chunk.iterrows():
                try:
                    # Extract and map fields to database schema
                    ref_num = str(row.get('Reference Number', '')) if pd.notna(row.get('Reference Number')) else f"REF_{total_processed}"
                    genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                    species_val = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                    
                    # Build scientific name
                    if genus and species_val:
                        scientific_name = f"{genus} {species_val}"
                    elif genus:
                        scientific_name = genus
                    else:
                        scientific_name = None
                    
                    # Extract coordinates
                    lat = None
                    lon = None
                    if pd.notna(row.get('Latitude')) and pd.notna(row.get('Longitude')):
                        try:
                            lat = float(row['Latitude'])
                            lon = float(row['Longitude'])
                            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                                lat, lon = None, None
                        except:
                            lat, lon = None, None
                    
                    cursor.execute("""
                        INSERT INTO observations (
                            observation_id, scientific_name, genus, species, collector,
                            latitude, longitude, state, country, genbank_accession,
                            dna_sequence, sequence, collection_number, verified,
                            kingdom, authority, mycobank_number, notes, source, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        ref_num,
                        scientific_name,
                        genus,
                        species_val,
                        str(row.get('Collector', '')).strip() if pd.notna(row.get('Collector')) else None,
                        lat,
                        lon,
                        str(row.get('State', '')).strip() if pd.notna(row.get('State')) else None,
                        str(row.get('Country', '')).strip() if pd.notna(row.get('Country')) else None,
                        str(row.get('GenBank Accession #', '')).strip() if pd.notna(row.get('GenBank Accession #')) else None,
                        str(row.get('DNA Sequence', '')).strip() if pd.notna(row.get('DNA Sequence')) else None,
                        str(row.get('Sequence', '')).strip() if pd.notna(row.get('Sequence')) else None,
                        str(row.get('Collection Number', '')).strip() if pd.notna(row.get('Collection Number')) else None,
                        str(row.get('Verified', '')).strip() if pd.notna(row.get('Verified')) else None,
                        str(row.get('Kingdom', '')).strip() if pd.notna(row.get('Kingdom')) else None,
                        str(row.get('Authority', '')).strip() if pd.notna(row.get('Authority')) else None,
                        str(row.get('Mycobank #', '')).strip() if pd.notna(row.get('Mycobank #')) else None,
                        str(row.get('Notes', '')).strip() if pd.notna(row.get('Notes')) else None,
                        str(row.get('Source Database', '')).strip() if pd.notna(row.get('Source Database')) else 'Excel Import',
                        datetime.now()
                    ))
                    
                    total_processed += 1
                    
                except Exception as e:
                    print(f"Error processing row {total_processed}: {e}")
                    continue
            
            # Commit each chunk
            conn.commit()
            print(f"Chunk complete. Total processed: {total_processed}")
            
            # For initial testing, limit to first 20,000 records
            if total_processed >= 20000:
                print("Stopping at 20,000 records for initial restoration test")
                break
        
        print(f"Successfully restored {total_processed} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Database verification: {count} observations")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT scientific_name) as unique_species,
                COUNT(DISTINCT collector) as unique_collectors,
                COUNT(DISTINCT state) as unique_states,
                COUNT(*) FILTER (WHERE latitude IS NOT NULL) as with_coordinates,
                COUNT(*) FILTER (WHERE genbank_accession IS NOT NULL) as with_genbank
            FROM observations
        """)
        stats = cursor.fetchone()
        print(f"\nRestoration Statistics:")
        print(f"  Total observations: {stats[0]}")
        print(f"  Unique species: {stats[1]}")
        print(f"  Unique collectors: {stats[2]}")
        print(f"  Unique states: {stats[3]}")
        print(f"  With coordinates: {stats[4]}")
        print(f"  With GenBank data: {stats[5]}")
        
        # Show sample data
        cursor.execute("SELECT observation_id, scientific_name, collector, state FROM observations LIMIT 5")
        samples = cursor.fetchall()
        print("\nSample restored records:")
        for sample in samples:
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
        
    except Exception as e:
        print(f"Critical error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    final_efficient_restore()