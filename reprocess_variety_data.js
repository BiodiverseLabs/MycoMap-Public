import XLSX from 'xlsx';
import fs from 'fs';
import { db } from './server/db.js';
import { observations } from './shared/schema.js';

async function reprocessVarietyData() {
  try {
    console.log('Starting variety data reprocessing...');
    
    // Read the original Excel file
    const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${data.length} rows in Excel file`);
    
    // Check if Variety column exists
    const sampleRow = data[0];
    const hasVarietyColumn = 'Variety' in sampleRow;
    console.log('Has Variety column:', hasVarietyColumn);
    
    if (hasVarietyColumn) {
      // Count non-empty variety values
      const varietyData = data.filter(row => row['Variety'] && row['Variety'] !== '');
      console.log(`Found ${varietyData.length} rows with variety data`);
      
      if (varietyData.length > 0) {
        console.log('Sample variety values:', varietyData.slice(0, 5).map(row => row['Variety']));
        
        // Update observations with variety data
        let updateCount = 0;
        
        for (const row of varietyData) {
          const referenceNumber = row['Reference Number'];
          const variety = row['Variety'];
          
          if (referenceNumber && variety) {
            try {
              await db.update(observations)
                .set({ infraspecies: variety })
                .where(observations.observationId.eq(referenceNumber));
              updateCount++;
              
              if (updateCount % 100 === 0) {
                console.log(`Updated ${updateCount} records...`);
              }
            } catch (error) {
              console.error(`Error updating record ${referenceNumber}:`, error);
            }
          }
        }
        
        console.log(`Successfully updated ${updateCount} records with variety data`);
        
        // Verify the updates
        const updatedCount = await db.select({ count: sql`count(*)` })
          .from(observations)
          .where(sql`${observations.infraspecies} IS NOT NULL`);
        
        console.log(`Verification: ${updatedCount[0].count} records now have infraspecies data`);
        
        // Show most frequent infraspecies
        const frequentVarieties = await db.select({
          infraspecies: observations.infraspecies,
          count: sql`count(*)`
        })
        .from(observations)
        .where(sql`${observations.infraspecies} IS NOT NULL`)
        .groupBy(observations.infraspecies)
        .orderBy(sql`count(*) DESC`)
        .limit(10);
        
        console.log('\nTop 10 most frequent infraspecies:');
        frequentVarieties.forEach((variety, index) => {
          console.log(`${index + 1}. ${variety.infraspecies}: ${variety.count} occurrences`);
        });
        
      } else {
        console.log('No variety data found in the Excel file');
      }
    } else {
      console.log('No Variety column found in the Excel file');
      console.log('Available columns:', Object.keys(sampleRow));
    }
    
  } catch (error) {
    console.error('Error reprocessing variety data:', error);
  }
}

reprocessVarietyData();