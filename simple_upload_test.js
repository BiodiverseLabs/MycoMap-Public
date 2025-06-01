import XLSX from 'xlsx';
import fs from 'fs';

async function testExcelReading() {
  try {
    console.log('Testing Excel file reading...');
    
    const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
    console.log('File exists:', fs.existsSync(filePath));
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found!');
      return;
    }
    
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile(filePath);
    console.log('Sheet names:', workbook.SheetNames);
    
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log('Total rows:', rawData.length);
    console.log('First row keys:', Object.keys(rawData[0] || {}));
    
    // Check validation flag logic on first few rows
    let nameUpdateCount = 0;
    let classificationUpdateCount = 0;
    
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      
      const nameUpdate = !row['Species'] && !row['Variety'];
      const hasSpeciesOrVariety = row['Species'] || row['Variety'];
      const missingHigherTaxonomy = hasSpeciesOrVariety && (
        !row['Kingdom'] || !row['Phylum'] || !row['Class'] || 
        !row['Order'] || !row['Family'] || !row['Genus']
      );
      const classificationUpdate = missingHigherTaxonomy;
      
      if (nameUpdate) nameUpdateCount++;
      if (classificationUpdate) classificationUpdateCount++;
      
      console.log(`Row ${i + 1}: Species="${row['Species']}", Variety="${row['Variety']}", nameUpdate=${nameUpdate}, classificationUpdate=${classificationUpdate}`);
    }
    
    console.log(`In first 10 rows: ${nameUpdateCount} name updates, ${classificationUpdateCount} classification updates`);
    console.log('Excel reading test completed successfully!');
    
  } catch (error) {
    console.error('Error during Excel test:', error);
  }
}

testExcelReading();