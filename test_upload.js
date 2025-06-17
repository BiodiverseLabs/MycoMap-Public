import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a small test dataset for upload verification
const testData = [
  {
    'Reference Number': '265571056',
    'Source Database': 'iNaturalist',
    'Genus': 'Amanita',
    'Species': 'Amanita muscaria',
    'Collector': 'Test Collector',
    'Report Date': '2024-01-15',
    'Country': 'United States',
    'State': 'California',
    'City': 'San Francisco',
    'Latitude': '37.7749',
    'Longitude': '-122.4194'
  },
  {
    'Reference Number': '123456789',
    'Source Database': 'iNaturalist', 
    'Genus': 'Boletus',
    'Species': 'Boletus edulis',
    'Collector': 'Another Collector',
    'Report Date': '2024-02-10',
    'Country': 'United States',
    'State': 'Oregon',
    'City': 'Portland',
    'Latitude': '45.5152',
    'Longitude': '-122.6784'
  },
  {
    'Reference Number': '987654321',
    'Source Database': 'iNaturalist',
    'Genus': 'Cantharellus',
    'Species': 'Cantharellus cibarius',
    'Collector': 'Test User',
    'Report Date': '2024-03-05',
    'Country': 'United States',
    'State': 'Washington',
    'City': 'Seattle',
    'Latitude': '47.6062',
    'Longitude': '-122.3321'
  }
];

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(testData);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Test Observations');

// Write the file
const outputPath = path.join(__dirname, 'test_observations.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`Test Excel file created: ${outputPath}`);
console.log(`Contains ${testData.length} test observations`);
console.log('File includes iNaturalist observation IDs for API sync testing');