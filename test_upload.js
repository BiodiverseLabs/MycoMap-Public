import XLSX from 'xlsx';

// Create a test Excel file with sample macrofungi data
const testData = [
  {
    'Observation ID': 'TEST001',
    'Scientific Name': 'Agaricus bisporus',
    'Common Name': 'Button Mushroom',
    'Phylum': 'Basidiomycota',
    'Class': 'Agaricomycetes',
    'Order': 'Agaricales',
    'Family': 'Agaricaceae',
    'Genus': 'Agaricus',
    'Species': 'bisporus',
    'Latitude': '40.7128',
    'Longitude': '-74.0060',
    'State': 'New York',
    'Observed On': '2024-05-15',
    'Observer': 'Test Observer',
    'Collector': 'Test Collector',
    'Institution': 'Test University'
  },
  {
    'Observation ID': 'TEST002',
    'Scientific Name': 'Pleurotus ostreatus',
    'Common Name': 'Oyster Mushroom',
    'Phylum': 'Basidiomycota',
    'Class': 'Agaricomycetes',
    'Order': 'Agaricales',
    'Family': 'Pleurotaceae',
    'Genus': 'Pleurotus',
    'Species': 'ostreatus',
    'Latitude': '34.0522',
    'Longitude': '-118.2437',
    'State': 'California',
    'Observed On': '2024-05-20',
    'Observer': 'Test Observer 2',
    'Collector': 'Test Collector 2',
    'Institution': 'Test Institute'
  }
];

// Create workbook and worksheet
const ws = XLSX.utils.json_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Validated Observations');

// Write test file
XLSX.writeFile(wb, 'test_observations.xlsx');
console.log('Test Excel file created: test_observations.xlsx');