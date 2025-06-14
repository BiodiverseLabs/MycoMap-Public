import psycopg2
import os
from datetime import datetime

def test_restore():
    print("Testing restoration mechanism with sample data...")
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cursor = conn.cursor()
    
    try:
        # Clear existing data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        # Insert test data to verify restoration works
        test_data = [
            ('TEST001', 'Amanita muscaria', 'Amanita', 'muscaria', 'John Smith', 'California', 'USA', 'Test Import'),
            ('TEST002', 'Boletus edulis', 'Boletus', 'edulis', 'Jane Doe', 'Oregon', 'USA', 'Test Import'),
            ('TEST003', 'Cantharellus cibarius', 'Cantharellus', 'cibarius', 'Bob Wilson', 'Washington', 'USA', 'Test Import'),
        ]
        
        for data in test_data:
            cursor.execute("""
                INSERT INTO observations (
                    observation_id, scientific_name, genus, species, collector, 
                    state, country, source, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (*data, datetime.now()))
        
        conn.commit()
        
        # Verify insertion
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Test insertion successful: {count} observations")
        
        # Show sample data
        cursor.execute("SELECT observation_id, scientific_name, collector, state FROM observations")
        samples = cursor.fetchall()
        print("Sample data:")
        for sample in samples:
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
        
        # Now try to restore a small subset from Excel
        print("\nAttempting small Excel restoration...")
        
        import pandas as pd
        
        # Read only first 100 rows from Excel
        excel_path = "attached_assets/Validated Observations05.30.25.xlsx"
        df = pd.read_excel(excel_path, nrows=100, engine='openpyxl')
        print(f"Read {len(df)} rows from Excel")
        
        # Clear test data
        cursor.execute("TRUNCATE TABLE observations CASCADE")
        conn.commit()
        
        successful_inserts = 0
        
        for _, row in df.iterrows():
            try:
                ref_num = str(row.get('Reference Number', f'REF_{successful_inserts}'))
                genus = str(row.get('Genus', '')).strip() if pd.notna(row.get('Genus')) else None
                species = str(row.get('Species', '')).strip() if pd.notna(row.get('Species')) else None
                
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
                
                successful_inserts += 1
                
            except Exception as e:
                print(f"Error inserting row {successful_inserts}: {e}")
                continue
        
        conn.commit()
        
        # Verify restoration
        cursor.execute("SELECT COUNT(*) FROM observations")
        count = cursor.fetchone()[0]
        print(f"Excel restoration successful: {count} observations from 100 rows")
        
        # Show sample Excel data
        cursor.execute("SELECT observation_id, scientific_name, collector, state FROM observations LIMIT 5")
        samples = cursor.fetchall()
        print("Sample Excel data:")
        for sample in samples:
            print(f"  {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    test_restore()