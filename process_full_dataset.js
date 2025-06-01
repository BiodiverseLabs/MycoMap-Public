import XLSX from 'xlsx';
import { db } from './server/db.ts';
import { observations, contributors, species } from './shared/schema.ts';

async function processFullDataset() {
  try {
    console.log('Starting full dataset processing with validation flags...');
    
    // Clear existing data
    console.log('Clearing existing data...');
    await db.delete(observations);
    await db.delete(contributors); 
    await db.delete(species);
    console.log('✓ Existing data cleared');
    
    // Read Excel file
    const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${rawData.length} total records in Excel file`);
    
    // Process data with validation flags
    console.log('Processing observations with validation flags...');
    let processedCount = 0;
    let nameUpdateCount = 0;
    let classificationUpdateCount = 0;
    
    const processedObservations = rawData.map((row, index) => {
      if (index % 5000 === 0) {
        console.log(`Processing row ${index + 1}/${rawData.length}...`);
      }
      
      // Construct scientific name following taxonomic hierarchy
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
      } else {
        scientificName = 'Unknown';
      }
      
      // Check for name_update flag: Species or Variety is missing
      const nameUpdate = !row['Species'] && !row['Variety'];
      if (nameUpdate) nameUpdateCount++;
      
      // Check for classification_update flag: has species/variety but missing higher taxonomy
      const hasSpeciesOrVariety = row['Species'] || row['Variety'];
      const missingHigherTaxonomy = hasSpeciesOrVariety && (
        !row['Kingdom'] || !row['Phylum'] || !row['Class'] || 
        !row['Order'] || !row['Family'] || !row['Genus']
      );
      const classificationUpdate = missingHigherTaxonomy;
      if (classificationUpdate) classificationUpdateCount++;

      return {
        observationId: row['Reference Number'] || `${Date.now()}-${Math.random()}`,
        scientificName: scientificName,
        commonName: null,
        phylum: row['Phylum'] || null,
        class: row['Class'] || null,
        order: row['Order'] || null,
        family: row['Family'] || null,
        genus: row['Genus'] || null,
        species: row['Species'] || null,
        infraspecies: row['Variety'] || null,
        observer: row['Sequence Owner'] || null,
        collector: row['Collector'] || null,
        observedOn: row['Report Date'] ? 
          new Date((row['Report Date'] - 25569) * 86400 * 1000).toISOString().split('T')[0] : null,
        latitude: row['Latitude'] ? String(row['Latitude']) : null,
        longitude: row['Longitude'] ? String(row['Longitude']) : null,
        placeGuess: row['City'] || null,
        state: row['State'] || null,
        country: row['Country'] || null,
        genbankAccession: row['GenBank Accession #'] || null,
        mycoportalNumber: row['MyCoPortal #'] || null,
        dnaSequence: row['DNA Sequence'] || null,
        sequence: row['Sequence'] || null,
        collectionNumber: row['Collection Number'] || null,
        creationDate: row['Creation Date'] ? 
          new Date((row['Creation Date'] - 25569) * 86400 * 1000).toISOString().split('T')[0] : null,
        verified: row['Verified'] || null,
        kingdom: row['Kingdom'] || null,
        authority: row['Authority'] || null,
        abbreviatedAuthority: row['Abbreviated Authority'] || null,
        mycobankNumber: row['Mycobank #'] || null,
        fungariumSpecimen: row['Fungarium Specimen'] || null,
        images: row['Images'] || null,
        flags: row['Flags'] || null,
        forwardPrimer: row['Forward Primer'] || null,
        reversePrimer: row['Reverse Primer'] || null,
        runName: row['Run Name'] || null,
        sequence2: row['Sequence #2'] || null,
        forwardPrimer2: row['Forward Primer #2'] || null,
        reversePrimer2: row['Reverse Primer #2'] || null,
        sequenceOwner2: row['Sequence Owner #2'] || null,
        runName2: row['Run Name #2'] || null,
        locationName: row['Location Name'] || null,
        notes: row['Notes'] || null,
        moNotes: row['MO Notes'] || null,
        reportLink: row['Report Link'] || null,
        imageLink: row['Image Link'] || null,
        firstGenbankRecord: row['First GenBank Record'] === 'yes',
        isFirstStateRecord: row['First State Record'] === 'yes',
        hasMultipleGenotypes: row['Multiple Genotypes Under Name'] === 'yes',
        source: row['Source Database'] || 'Unknown',
        sourceUrl: null,
        nameUpdate: nameUpdate,
        classificationUpdate: classificationUpdate,
      };
    }).filter(obs => obs.scientificName && obs.scientificName !== 'Unknown');
    
    console.log(`\n✓ Processed ${processedObservations.length} valid observations`);
    console.log(`✓ Name updates flagged: ${nameUpdateCount}`);
    console.log(`✓ Classification updates flagged: ${classificationUpdateCount}`);
    
    // Insert in smaller batches to avoid timeouts
    const batchSize = 500; // Smaller batch size for reliability
    let insertedCount = 0;
    
    console.log(`\nStarting database insertion in batches of ${batchSize}...`);
    
    for (let i = 0; i < processedObservations.length; i += batchSize) {
      const batch = processedObservations.slice(i, i + batchSize);
      const batchNumber = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(processedObservations.length/batchSize);
      
      console.log(`Inserting batch ${batchNumber}/${totalBatches} (${batch.length} records)...`);
      
      try {
        await db.insert(observations).values(batch);
        insertedCount += batch.length;
        console.log(`✓ Batch ${batchNumber} completed. Total inserted: ${insertedCount}`);
        
        // Progress milestones
        if (insertedCount % 5000 === 0 || insertedCount === processedObservations.length) {
          console.log(`🎯 MILESTONE: ${insertedCount} observations inserted successfully`);
        }
        
        // Small delay to prevent overwhelming the database
        if (batchNumber % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (batchError) {
        console.error(`✗ Error inserting batch ${batchNumber}:`, batchError);
        throw batchError;
      }
    }
    
    console.log(`\n🎉 SUCCESS! Inserted ${insertedCount} observations total`);
    console.log(`\n=== VALIDATION FLAG SUMMARY ===`);
    console.log(`Total observations: ${insertedCount}`);
    console.log(`Name updates needed: ${nameUpdateCount} (${((nameUpdateCount/insertedCount)*100).toFixed(1)}%)`);
    console.log(`Classification updates needed: ${classificationUpdateCount} (${((classificationUpdateCount/insertedCount)*100).toFixed(1)}%)`);
    console.log(`Total flagged observations: ${nameUpdateCount + classificationUpdateCount} (${(((nameUpdateCount + classificationUpdateCount)/insertedCount)*100).toFixed(1)}%)`);
    
    console.log('\n📋 Flag Definitions:');
    console.log('• Name Update: Flagged when Species AND Variety are both missing');
    console.log('• Classification Update: Flagged when Species/Variety exists but Kingdom, Phylum, Class, Order, Family, or Genus is missing');
    
    console.log('\n🚀 Full dataset processing completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during full dataset processing:', error);
  } finally {
    process.exit(0);
  }
}

processFullDataset();