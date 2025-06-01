import XLSX from 'xlsx';

try {
  const workbook = XLSX.readFile('./attached_assets/Validated Observations05.30.25.xlsx');
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Get all column headers from the Excel file
  const excelColumns = data[0].filter(col => col && col.trim() !== '');
  
  console.log('=== EXCEL FILE COLUMN ANALYSIS ===\n');
  console.log(`Total columns in Excel file: ${excelColumns.length}\n`);
  
  // Currently mapped fields in our upload process
  const mappedFields = [
    'Reference Number',
    'Genus', 
    'Species',
    'Variety',
    'Sequence Owner',
    'Collector', 
    'Report Date',
    'Latitude',
    'Longitude', 
    'City',
    'State',
    'Country',
    'GenBank Accession #',
    'MyCoPortal #',
    'DNA Sequence',
    'Sequence',
    'First State Record',
    'Multiple Genotypes Under Name',
    'Source Database',
    'Source URL',
    'Phylum',
    'Class',
    'Order',
    'Family'
  ];
  
  console.log('=== CURRENTLY MAPPED FIELDS ===');
  mappedFields.forEach((field, index) => {
    const exists = excelColumns.includes(field);
    console.log(`${(index + 1).toString().padStart(2)}. ${field} ${exists ? '✓' : '✗ (NOT FOUND)'}`);
  });
  
  console.log('\n=== UNMAPPED FIELDS IN EXCEL ===');
  const unmappedFields = excelColumns.filter(col => !mappedFields.includes(col));
  unmappedFields.forEach((field, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${field}`);
  });
  
  console.log(`\nSummary:`);
  console.log(`- Excel columns: ${excelColumns.length}`);
  console.log(`- Currently mapped: ${mappedFields.filter(f => excelColumns.includes(f)).length}`);
  console.log(`- Unmapped fields: ${unmappedFields.length}`);
  
  // Check for data in some key unmapped fields
  if (unmappedFields.length > 0) {
    console.log('\n=== SAMPLE DATA FROM UNMAPPED FIELDS ===');
    unmappedFields.slice(0, 5).forEach(field => {
      const columnIndex = excelColumns.indexOf(field);
      if (columnIndex >= 0) {
        const nonEmptyValues = data.slice(1, 11)
          .map(row => row[columnIndex])
          .filter(val => val && val !== '');
        console.log(`\n${field}:`);
        console.log(`  Non-empty values in first 10 rows: ${nonEmptyValues.length}`);
        if (nonEmptyValues.length > 0) {
          console.log(`  Sample: ${nonEmptyValues.slice(0, 3).join(', ')}`);
        }
      }
    });
  }
  
} catch (error) {
  console.error('Error analyzing Excel file:', error);
}