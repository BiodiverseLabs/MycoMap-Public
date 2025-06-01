#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.pythonlibs', 'lib', 'python3.11', 'site-packages'))

import pandas as pd

try:
    # Read just the header row
    df = pd.read_excel('./attached_assets/Validated Observations05.30.25.xlsx', nrows=0)
    all_columns = list(df.columns)

    print("=== ALL COLUMNS IN YOUR EXCEL FILE ===")
    for i, col in enumerate(all_columns, 1):
        print(f"{i:2d}. {col}")

    # Currently mapped fields
    mapped = [
        'Reference Number', 'Genus', 'Species', 'Variety', 'Sequence Owner', 
        'Collector', 'Report Date', 'Latitude', 'Longitude', 'City', 'State', 
        'Country', 'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 
        'Sequence', 'First State Record', 'Multiple Genotypes Under Name', 
        'Source Database', 'Source URL', 'Phylum', 'Class', 'Order', 'Family'
    ]

    print("\n=== UNMAPPED FIELDS ===")
    unmapped = [col for col in all_columns if col not in mapped]
    for i, col in enumerate(unmapped, 1):
        print(f"{i:2d}. {col}")

    print(f"\nSUMMARY:")
    print(f"Total columns: {len(all_columns)}")
    print(f"Currently mapped: {len([f for f in mapped if f in all_columns])}")
    print(f"Unmapped: {len(unmapped)}")

except Exception as e:
    print(f"Error: {e}")