import XLSX from 'xlsx';
import fs from 'fs';
import { db } from './server/db.js';
import { observations, contributors, species } from './shared/schema.js';

async function processLargeDataset() {
  try {
    console.log('=== LARGE DATASET PROCESSING ===');
    
    const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
    console.log('File exists:', fs.existsSync(filePath));
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found!');
      return;
    }
    
    // Clear existing data
    console.log('Clearing existing data...');
    await db.delete(observations);
    await db.delete(contributors);
    await db.delete(species);
    console.log('✓ Data cleared');
    
    // Read Excel file
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Total records: ${rawData.length}`);
    
    // Process in smaller batches
    const BATCH_SIZE = 500;
    const totalBatches = Math.ceil(rawData.length / BATCH_SIZE);
    
    let totalProcessed = 0;
    let nameUpdates = 0;
    let classificationUpdates = 0;
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, rawData.length);
      const batch = rawData.slice(startIdx, endIdx);
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${startIdx + 1}-${endIdx})`);
      
      const batchObservations = [];
      
      for (const row of batch) {
        // Build scientific name
        let scientificName = '';
        if (row['Variety']) {
          scientificName = row['Variety'];
        } else if (row['Species']) {
          scientificName = row['Species'];
        } else if (row['Genus']) {
          scientificName = row['Genus'];
        } else if (row['Family']) {
          scientificName = row['Family'];
        } else if (row['Order']) {
          scientificName = row['Order'];
        } else if (row['Class']) {
          scientificName = row['Class'];
        } else if (row['Phylum']) {
          scientificName = row['Phylum'];
        } else if (row['Kingdom']) {
          scientificName = row['Kingdom'];
        }
        
        // Validation flags
        const nameUpdate = !row['Species'] && !row['Variety'];
        const hasSpeciesOrVariety = row['Species'] || row['Variety'];
        const missingHigherTaxonomy = hasSpeciesOrVariety && (
          !row['Kingdom'] || !row['Phylum'] || !row['Class'] || 
          !row['Order'] || !row['Family'] || !row['Genus']
        );
        const classificationUpdate = missingHigherTaxonomy;
        
        if (nameUpdate) nameUpdates++;
        if (classificationUpdate) classificationUpdates++;
        
        const observation = {
          observationId: row['Reference Number'] || '',
          scientificName: scientificName || 'Unknown',
          commonName: null,
          phylum: row['Phylum'] || null,
          class: row['Class'] || null,
          order: row['Order'] || null,
          family: row['Family'] || null,
          genus: row['Genus'] || null,
          species: row['Species'] || null,
          variety: row['Variety'] || null,
          authority: row['Authority'] || null,
          abbreviatedAuthority: row['Abbreviated Authority'] || null,
          mycobankNumber: row['Mycobank #'] || null,
          fungariumSpecimen: row['Fungarium Specimen'] || null,
          images: row['Images'] || null,
          genbankAccession: row['GenBank Accession #'] || null,
          mycoportalNumber: row['MyCoPortal #'] || null,
          dnaSequence: row['DNA Sequence'] || null,
          sequence: row['Sequence'] || null,
          flags: row['Flags'] || null,
          forwardPrimer: row['Forward Primer'] || null,
          reversePrimer: row['Reverse Primer'] || null,
          sequenceOwner: row['Sequence Owner'] || null,
          runName: row['Run Name'] || null,
          sequence2: row['Sequence #2'] || null,
          forwardPrimer2: row['Forward Primer #2'] || null,
          reversePrimer2: row['Reverse Primer #2'] || null,
          sequenceOwner2: row['Sequence Owner #2'] || null,
          runName2: row['Run Name #2'] || null,
          locationName: row['Location Name'] || null,
          country: row['Country'] || null,
          city: row['City'] || null,
          state: row['State'] || null,
          latitude: row['Latitude'] ? parseFloat(row['Latitude']) : null,
          longitude: row['Longitude'] ? parseFloat(row['Longitude']) : null,
          reportDate: row['Report Date'] ? new Date(row['Report Date']) : null,
          creationDate: row['Creation Date'] ? new Date(row['Creation Date']) : null,
          collector: row['Collector'] || null,
          verified: row['Verified'] || null,
          notes: row['Notes'] || null,
          moNotes: row['MO Notes'] || null,
          reportLink: row['Report Link'] || null,
          imageLink: row['Image Link'] || null,
          firstStateRecord: row['First State Record'] === 'TRUE' || row['First State Record'] === true,
          firstGenbankRecord: row['First GenBank Record'] === 'TRUE' || row['First GenBank Record'] === true,
          multipleGenotypesUnderName: row['Multiple Genotypes Under Name'] === 'TRUE' || row['Multiple Genotypes Under Name'] === true,
          nameUpdate,
          classificationUpdate,
          source: row['Source Database'] || 'Unknown',
          collectionNumber: row['Collection Number'] || null,
          datasetRecordNumber: batchIndex * BATCH_SIZE + (batchObservations.length + 1),
          stateRecordNumber: 0,
          isFirstGlobal: false,
          isFirstInState: false
        };
        
        batchObservations.push(observation);
      }
      
      // Insert batch
      try {
        await db.insert(observations).values(batchObservations);
        totalProcessed += batchObservations.length;
        console.log(`✓ Batch ${batchIndex + 1} inserted (${totalProcessed} total)`);
      } catch (error) {
        console.error(`✗ Error inserting batch ${batchIndex + 1}:`, error);
        throw error;
      }
      
      // Progress update every 10 batches
      if ((batchIndex + 1) % 10 === 0) {
        console.log(`Progress: ${totalProcessed} records processed`);
      }
    }
    
    console.log('=== PROCESSING COMPLETE ===');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Name updates needed: ${nameUpdates}`);
    console.log(`Classification updates needed: ${classificationUpdates}`);
    
  } catch (error) {
    console.error('Processing failed:', error);
  }
}

processLargeDataset();