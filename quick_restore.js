import { db } from './server/db.js';
import fs from 'fs';
import path from 'path';

async function quickRestore() {
  console.log('Starting quick restoration...');
  
  // Use the existing processExcelFile function from the server
  const { processExcelFile } = await import('./server/db.js');
  
  const excelPath = path.join(process.cwd(), 'attached_assets', 'Validated Observations05.30.25.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.error('Original Excel file not found');
    return;
  }
  
  console.log('Processing original Excel file...');
  
  try {
    // Clear existing data first
    await db.clearAllData();
    console.log('Cleared existing data');
    
    // Process the original Excel file
    await processExcelFile('restore', excelPath, 'Validated Observations05.30.25.xlsx');
    
    console.log('Restoration completed successfully');
    
    // Verify count
    const result = await db.execute('SELECT COUNT(*) as count FROM observations');
    console.log(`Restored ${result.rows[0].count} observations`);
    
  } catch (error) {
    console.error('Restoration error:', error);
  }
}

quickRestore();