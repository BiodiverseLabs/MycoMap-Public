import XLSX from 'xlsx';

try {
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile('./attached_assets/Validated Observations05.30.25.xlsx');
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Get just the first few rows to see column structure
  const data = XLSX.utils.sheet_to_json(worksheet, { range: "A1:Z3" });
  
  if (data.length > 0) {
    const allColumns = Object.keys(data[0]);
    console.log('\n=== ALL COLUMNS IN EXCEL FILE ===');
    allColumns.forEach((col, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${col}`);
    });
    
    // Currently mapped fields
    const currentlyMapped = [
      'Reference Number', 'Genus', 'Species', 'Variety', 'Sequence Owner', 
      'Collector', 'Report Date', 'Latitude', 'Longitude', 'City', 'State', 
      'Country', 'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 
      'Sequence', 'First State Record', 'Multiple Genotypes Under Name', 
      'Source Database', 'Source URL', 'Phylum', 'Class', 'Order', 'Family'
    ];
    
    console.log('\n=== UNMAPPED FIELDS ===');
    const unmapped = allColumns.filter(col => !currentlyMapped.includes(col));
    unmapped.forEach((col, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${col}`);
    });
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total columns in Excel: ${allColumns.length}`);
    console.log(`Currently mapped: ${currentlyMapped.filter(f => allColumns.includes(f)).length}`);
    console.log(`Unmapped fields: ${unmapped.length}`);
    
    if (unmapped.length > 0) {
      console.log('\n=== SAMPLE DATA FROM UNMAPPED FIELDS ===');
      unmapped.slice(0, 5).forEach(field => {
        const sampleValue = data.find(row => row[field])? data.find(row => row[field])[field] : 'No data';
        console.log(`${field}: ${sampleValue}`);
      });
    }
  }
  
} catch (error) {
  console.error('Error:', error.message);
}