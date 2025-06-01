import XLSX from 'xlsx';
import fs from 'fs';

try {
  const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
  console.log('File exists:', fs.existsSync(filePath));
  
  const workbook = XLSX.readFile(filePath);
  console.log('Sheet names:', workbook.SheetNames);
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log('\nTotal rows:', data.length);
  console.log('\nAvailable columns:');
  if (data.length > 0) {
    Object.keys(data[0]).forEach((col, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${col}`);
    });
    
    // Check for variety/infraspecies related columns
    const varietyColumns = Object.keys(data[0]).filter(col => 
      col.toLowerCase().includes('variety') || 
      col.toLowerCase().includes('infraspecies') ||
      col.toLowerCase().includes('subspecies') ||
      col.toLowerCase().includes('var.')
    );
    
    if (varietyColumns.length > 0) {
      console.log('\nFound variety/infraspecies related columns:');
      varietyColumns.forEach(col => {
        const nonNullCount = data.filter(row => row[col] && row[col] !== '').length;
        console.log(`  "${col}": ${nonNullCount} non-empty values out of ${data.length}`);
        
        if (nonNullCount > 0) {
          const samples = data
            .filter(row => row[col] && row[col] !== '')
            .slice(0, 5)
            .map(row => row[col]);
          console.log(`    Sample values: ${samples.join(', ')}`);
        }
      });
    } else {
      console.log('\nNo variety or infraspecies related columns found');
    }
    
    console.log('\nSample row:');
    console.log(data[0]);
  }
} catch (error) {
  console.error('Error:', error);
}