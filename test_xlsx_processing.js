import XLSX from 'xlsx';
const { readFile, utils } = XLSX;

try {
  console.log('Testing XLSX processing with test file...');
  
  // Read the test Excel file
  const workbook = readFile('test_observations.xlsx');
  console.log('✓ Workbook loaded successfully');
  console.log('Sheet names:', workbook.SheetNames);
  
  // Find the correct sheet
  const sheetName = workbook.SheetNames.find(name => 
    name.toLowerCase().includes('validated') || 
    name.toLowerCase().includes('observation')
  ) || workbook.SheetNames[0];
  
  console.log('Using sheet:', sheetName);
  
  // Convert to JSON
  const worksheet = workbook.Sheets[sheetName];
  const rawData = utils.sheet_to_json(worksheet);
  
  console.log('✓ Data parsed successfully');
  console.log('Number of rows:', rawData.length);
  console.log('Sample row:', rawData[0]);
  
} catch (error) {
  console.error('✗ Error processing Excel file:', error.message);
}