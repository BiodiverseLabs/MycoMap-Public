import XLSX from 'xlsx';
import fs from 'fs';
import { spawn } from 'child_process';

async function processLargeExcelRobust() {
  try {
    console.log('=== ROBUST EXCEL PROCESSING ===');
    
    const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
    console.log('File exists:', fs.existsSync(filePath));
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found!');
      return;
    }
    
    // First, let's check the file size and structure
    const stats = fs.statSync(filePath);
    console.log(`File size: ${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB`);
    
    console.log('Reading Excel file structure...');
    const workbook = XLSX.readFile(filePath, { sheetRows: 10 }); // Only read first 10 rows to check structure
    console.log('Sheet names:', workbook.SheetNames);
    
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const sampleData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log('Sample data structure:');
    console.log('Row count in sample:', sampleData.length);
    if (sampleData.length > 0) {
      console.log('Available columns:', Object.keys(sampleData[0]));
    }
    
    // Now read the full file to get total row count
    console.log('Getting total row count...');
    const fullWorkbook = XLSX.readFile(filePath);
    const fullWorksheet = fullWorkbook.Sheets[fullWorkbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(fullWorksheet['!ref']);
    const totalRows = range.e.r + 1; // +1 because rows are 0-indexed
    
    console.log(`Total rows in Excel file: ${totalRows}`);
    console.log(`Estimated data rows (excluding header): ${totalRows - 1}`);
    
    if (totalRows > 50000) {
      console.log('⚠️  Large dataset detected. This will require batch processing.');
      console.log('Recommended approach: Process in chunks of 5,000 records each');
      
      // For very large files, we should use a streaming approach
      console.log('Due to the large size, please consider:');
      console.log('1. Using smaller test files first');
      console.log('2. Processing in multiple smaller uploads');
      console.log('3. Using direct database import tools');
      
      return;
    }
    
    // For smaller files, proceed with normal processing
    console.log('Processing manageable file size...');
    const fullData = XLSX.utils.sheet_to_json(fullWorksheet);
    console.log(`Actual data rows: ${fullData.length}`);
    
    // Quick validation check
    let nameUpdates = 0;
    let classificationUpdates = 0;
    
    for (let i = 0; i < Math.min(100, fullData.length); i++) {
      const row = fullData[i];
      const nameUpdate = !row['Species'] && !row['Variety'];
      const hasSpeciesOrVariety = row['Species'] || row['Variety'];
      const missingHigherTaxonomy = hasSpeciesOrVariety && (
        !row['Kingdom'] || !row['Phylum'] || !row['Class'] || 
        !row['Order'] || !row['Family'] || !row['Genus']
      );
      const classificationUpdate = missingHigherTaxonomy;
      
      if (nameUpdate) nameUpdates++;
      if (classificationUpdate) classificationUpdates++;
    }
    
    console.log(`Validation preview (first 100 rows): ${nameUpdates} name updates, ${classificationUpdates} classification updates`);
    
  } catch (error) {
    console.error('Processing failed:', error);
  }
}

processLargeExcelRobust();