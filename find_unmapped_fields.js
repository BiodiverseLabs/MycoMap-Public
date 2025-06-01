import XLSX from 'xlsx';
import fs from 'fs';

// Read first few rows to see what data is available
const workbook = XLSX.readFile('./attached_assets/Validated Observations05.30.25.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: "A1:Z10" });

const headers = data[0];
console.log('Excel file has', headers.length, 'columns total\n');

// Fields we currently map
const mapped = [
  'Reference Number', 'Genus', 'Species', 'Variety', 'Sequence Owner', 
  'Collector', 'Report Date', 'Latitude', 'Longitude', 'City', 'State', 
  'Country', 'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 
  'Sequence', 'First State Record', 'Multiple Genotypes Under Name', 
  'Source Database', 'Source URL', 'Phylum', 'Class', 'Order', 'Family'
];

console.log('=== UNMAPPED FIELDS ===');
const unmapped = [];
headers.forEach((header, index) => {
  if (header && !mapped.includes(header)) {
    unmapped.push(header);
    // Check if this field has data in first few rows
    const hasData = data.slice(1, 6).some(row => row[index] && row[index] !== '');
    console.log(`${unmapped.length.toString().padStart(2)}. ${header}${hasData ? ' (has data)' : ' (empty in sample)'}`);
  }
});

console.log(`\nFound ${unmapped.length} unmapped fields out of ${headers.length} total columns`);
console.log(`Currently mapping ${mapped.length} fields`);