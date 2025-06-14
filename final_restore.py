import pandas as pd
import psycopg2
import os
from datetime import datetime

def final_restore():
    print("Starting final restoration with proper field mapping...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        print("Cleared existing data")
        
        # Load Excel with specific columns we need
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        print(f"Loading Excel file: {excel_path}")
        
        # Read only the columns we can map to our schema
        df = pd.read_excel(excel_path, engine='openpyxl')
        print(f"Loaded {len(df)} records from Excel file")
        
        # Map Excel columns to database schema
        total_inserted = 0
        batch_size = 100
        
        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            
            for _, row in batch.iterrows():
                try:
                    # Map Excel columns to our database schema
                    observation_id = str(row.get('Reference Number', '')) if pd.notna(row.get('Reference Number')) else None
                    
                    # Build scientific name from genus and species
                    genus = str(row.get('Genus', '')) if pd.notna(row.get('Genus')) else ''
                    species = str(row.get('Species', '')) if pd.notna(row.get('Species')) else ''
                    variety = str(row.get('Variety', '')) if pd.notna(row.get('Variety')) else ''
                    
                    if genus and species:
                        scientific_name = f"{genus} {species}"
                        if variety:
                            scientific_name += f" {variety}"
                    else:
                        scientific_name = None
                    
                    # Extract coordinates
                    latitude = row.get('Latitude')
                    longitude = row.get('Longitude')
                    if pd.notna(latitude) and pd.notna(longitude):
                        try:
                            lat = float(latitude)
                            lon = float(longitude)
                        except:
                            lat, lon = None, None
                    else:
                        lat, lon = None, None
                    
                    # Parse date
                    event_date = None
                    if pd.notna(row.get('Report Date')):
                        try:
                            event_date = pd.to_datetime(row.get('Report Date')).date()
                        except:
                            pass
                    
                    cursor.execute("""
                        INSERT INTO observations (
                            observation_id, scientific_name, kingdom, phylum, class, "order", family, genus,
                            specific_epithet, infraspecific_epithet, recorded_by, state_province, country, locality,
                            decimal_latitude, decimal_longitude, event_date, source, url, image_url,
                            dna_sequence_url, occurrence_remarks, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        observation_id,
                        scientific_name,
                        str(row.get('Kingdom', '')) if pd.notna(row.get('Kingdom')) else None,
                        str(row.get('Phylum', '')) if pd.notna(row.get('Phylum')) else None,
                        str(row.get('Class', '')) if pd.notna(row.get('Class')) else None,
                        str(row.get('Order', '')) if pd.notna(row.get('Order')) else None,
                        str(row.get('Family', '')) if pd.notna(row.get('Family')) else None,
                        genus if genus else None,
                        species if species else None,
                        variety if variety else None,
                        str(row.get('Collector', '')) if pd.notna(row.get('Collector')) else None,
                        str(row.get('State', '')) if pd.notna(row.get('State')) else None,
                        str(row.get('Country', '')) if pd.notna(row.get('Country')) else None,
                        str(row.get('Location Name', '')) if pd.notna(row.get('Location Name')) else None,
                        lat,
                        lon,
                        event_date,
                        str(row.get('Source Database', '')) if pd.notna(row.get('Source Database')) else 'Excel Import',
                        str(row.get('Report Link', '')) if pd.notna(row.get('Report Link')) else None,
                        str(row.get('Image Link', '')) if pd.notna(row.get('Image Link')) else None,
                        str(row.get('DNA Sequence', '')) if pd.notna(row.get('DNA Sequence')) else None,
                        str(row.get('Notes', '')) if pd.notna(row.get('Notes')) else None,
                        datetime.now()
                    ))
                    total_inserted += 1
                    
                except Exception as e:
                    print(f"Error inserting row {total_inserted}: {e}")
                    continue
            
            conn.commit()
            print(f"Processed batch {i//batch_size + 1}, total inserted: {total_inserted}")
        
        print(f"Successfully restored {total_inserted} observations!")
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Final verification: {count} observations in database")
        
        # Show sample of restored data
        cursor.execute("SELECT observation_id, scientific_name, recorded_by, state_province FROM observations LIMIT 5")
        samples = cursor.fetchall()
        print("\nSample restored records:")
        for sample in samples:
            print(f"  ID: {sample[0]}, Species: {sample[1]}, Collector: {sample[2]}, State: {sample[3]}")
        
    except Exception as e:
        print(f"Error during restoration: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    final_restore()