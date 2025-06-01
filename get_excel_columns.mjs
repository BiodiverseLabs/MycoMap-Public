import XLSX from 'xlsx';

const workbook = XLSX.readFile('./attached_assets/Validated Observations05.30.25.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];

// Get just the header row
const range = XLSX.utils.decode_range(worksheet['!ref']);
const headerRow = XLSX.utils.sheet_to_json(worksheet, { 
  range: `A1:${XLSX.utils.encode_col(range.e.c)}1`,
  header: 1 
})[0];

const allColumns = headerRow.filter(col => col && String(col).trim() !== '');

console.log('=== ALL COLUMNS IN YOUR EXCEL FILE ===');
allColumns.forEach((col, i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${col}`);
});

// Currently mapped fields
const mapped = [
  'Reference Number', 'Genus', 'Species', 'Variety', 'Sequence Owner', 
  'Collector', 'Report Date', 'Latitude', 'Longitude', 'City', 'State', 
  'Country', 'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 
  'Sequence', 'First State Record', 'Multiple Genotypes Under Name', 
  'Source Database', 'Source URL', 'Phylum', 'Class', 'Order', 'Family'
];

console.log('\n=== UNMAPPED FIELDS ===');
const unmapped = allColumns.filter(col => !mapped.includes(col));
unmapped.forEach((col, i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${col}`);
});

console.log(`\nSUMMARY:`);
console.log(`Total columns: ${allColumns.length}`);
console.log(`Currently mapped: ${mapped.filter(f => allColumns.includes(f)).length}`);
console.log(`Unmapped: ${unmapped.length}`);