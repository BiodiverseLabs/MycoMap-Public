import pandas as pd
import psycopg2
import os
from datetime import datetime

def csv_restore():
    print("Converting Excel to CSV for faster processing...")
    
    # Convert Excel to CSV first for faster processing
    excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
    csv_path = "temp_observations.csv"
    
    try:
        # Convert Excel to CSV
        df = pd.read_excel(excel_path, engine='openpyxl')
        df.to_csv(csv_path, index=False)
        print(f"Converted Excel to CSV: {len(df)} records")
        
        # Connect to database
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cursor = conn.cursor()
        
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        print("Cleared existing data")
        
        # Use COPY command for bulk insert (fastest method)
        with open(csv_path, 'r', encoding='utf-8') as f:
            # Skip header line
            next(f)
            
            cursor.copy_expert("""
                COPY observations (
                    observation_id, scientific_name, common_name, kingdom, phylum, class, "order", family, genus,
                    specific_epithet, recorded_by, state_province, country, decimal_latitude, decimal_longitude,
                    event_date, source, url, image_url, dna_sequence_url, trace_file_url
                ) FROM STDIN WITH CSV DELIMITER ','
            """, f)
        
        conn.commit()
        
        # Update created_at timestamps
        cursor.execute("UPDATE observations SET created_at = %s WHERE created_at IS NULL", (datetime.now(),))
        conn.commit()
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Successfully restored {count} observations!")
        
        cursor.close()
        conn.close()
        
        # Clean up temp file
        os.remove(csv_path)
        
    except Exception as e:
        print(f"Error: {e}")
        if os.path.exists(csv_path):
            os.remove(csv_path)

if __name__ == "__main__":
    csv_restore()