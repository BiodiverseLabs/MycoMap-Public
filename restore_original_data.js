const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Client } = require('pg');

async function restoreOriginalData() {
  console.log('Starting data restoration from original Excel file...');
  
  // Connect to database
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('Connected to database');
    
    // Clear existing data
    console.log('Clearing existing truncated data...');
    await client.query('TRUNCATE TABLE observations CASCADE');
    
    // Load original Excel file
    const excelPath = path.join(__dirname, 'attached_assets', 'Validated Observations05.30.25.xlsx');
    console.log(`Loading Excel file: ${excelPath}`);
    
    if (!fs.existsSync(excelPath)) {
      throw new Error('Original Excel file not found');
    }
    
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${data.length} records in Excel file`);
    
    // Insert data in batches
    const batchSize = 1000;
    let insertedCount = 0;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(data.length/batchSize)}`);
      
      const values = [];
      const placeholders = [];
      let paramCount = 1;
      
      for (const row of batch) {
        // Map Excel columns to database columns
        const observationId = row['ObservationID'] || row['Observation ID'] || row['observation_id'] || `obs_${Date.now()}_${Math.random()}`;
        const scientificName = row['ScientificName'] || row['Scientific Name'] || row['scientific_name'] || '';
        const commonName = row['CommonName'] || row['Common Name'] || row['common_name'] || null;
        const observer = row['Observer'] || row['observer'] || null;
        const collector = row['Collector'] || row['collector'] || null;
        const observedOn = row['ObservedOn'] || row['Observed On'] || row['observed_on'] || null;
        const state = row['State'] || row['state'] || null;
        const source = row['Source'] || row['source'] || 'Imported';
        
        placeholders.push(`($${paramCount}, $${paramCount+1}, $${paramCount+2}, $${paramCount+3}, $${paramCount+4}, $${paramCount+5}, $${paramCount+6}, $${paramCount+7})`);
        values.push(observationId, scientificName, commonName, observer, collector, observedOn, state, source);
        paramCount += 8;
      }
      
      if (values.length > 0) {
        const insertQuery = `
          INSERT INTO observations (observation_id, scientific_name, common_name, observer, collector, observed_on, state, source)
          VALUES ${placeholders.join(', ')}
        `;
        
        await client.query(insertQuery, values);
        insertedCount += batch.length;
        console.log(`Inserted ${insertedCount}/${data.length} records`);
      }
    }
    
    // Verify restoration
    const result = await client.query('SELECT COUNT(*) as count FROM observations');
    const finalCount = parseInt(result.rows[0].count);
    
    console.log(`Data restoration complete! Total records: ${finalCount}`);
    
    if (finalCount > 50000) {
      console.log('✓ Successfully restored large dataset');
    } else {
      console.log('⚠ Warning: Restored dataset smaller than expected');
    }
    
  } catch (error) {
    console.error('Error during data restoration:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run restoration
restoreOriginalData()
  .then(() => {
    console.log('Restoration process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Restoration failed:', error);
    process.exit(1);
  });