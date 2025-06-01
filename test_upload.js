import XLSX from 'xlsx';

const workbook = XLSX.readFile('./attached_assets/Validated Observations05.30.25.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];

// Get just the first row to see actual column headers
const headerRange = XLSX.utils.decode_range(worksheet['!ref']);
headerRange.e.r = 0; // Only first row
const headerData = XLSX.utils.sheet_to_json(worksheet, { 
  range: headerRange,
  header: 1 
});

const actualColumns = headerData[0].filter(col => col && col.trim() !== '');

console.log('=== ACTUAL COLUMNS IN YOUR EXCEL FILE ===');
actualColumns.forEach((col, i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${col}`);
});

// Fields we currently map
const currentlyMapped = [
  'Reference Number', 'Genus', 'Species', 'Variety', 'Sequence Owner', 
  'Collector', 'Report Date', 'Latitude', 'Longitude', 'City', 'State', 
  'Country', 'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 
  'Sequence', 'First State Record', 'Multiple Genotypes Under Name', 
  'Source Database', 'Source URL', 'Phylum', 'Class', 'Order', 'Family'
];

console.log('\n=== UNMAPPED FIELDS IN YOUR EXCEL ===');
const unmapped = actualColumns.filter(col => !currentlyMapped.includes(col));
unmapped.forEach((col, i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${col}`);
});

console.log(`\nTotal: ${actualColumns.length} columns`);
console.log(`Mapped: ${currentlyMapped.filter(f => actualColumns.includes(f)).length}`);
console.log(`Unmapped: ${unmapped.length}`);