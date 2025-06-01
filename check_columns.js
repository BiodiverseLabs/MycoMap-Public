import XLSX from 'xlsx';

// Read the Excel file
const workbook = XLSX.readFile('./attached_assets/Validated Observations05.30.25.xlsx');
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

// Get column headers
const headers = data[0];
console.log('All Excel columns:');
headers.forEach((header, index) => {
  if (header) {
    console.log(`${(index + 1).toString().padStart(2)}. ${header}`);
  }
});

// Currently mapped columns in our system
const mapped = [
  'Reference Number', 'Genus', 'Species', 'Variety', 'Sequence Owner', 'Collector',
  'Report Date', 'Latitude', 'Longitude', 'City', 'State', 'Country',
  'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 'Sequence',
  'First State Record', 'Multiple Genotypes Under Name', 'Source Database',
  'Source URL', 'Phylum', 'Class', 'Order', 'Family'
];

console.log('\n\nUnmapped columns:');
const unmapped = headers.filter(h => h && !mapped.includes(h));
unmapped.forEach((col, idx) => {
  console.log(`${(idx + 1).toString().padStart(2)}. ${col}`);
});

console.log(`\nSummary: ${headers.filter(h => h).length} total columns, ${mapped.length} mapped, ${unmapped.length} unmapped`);