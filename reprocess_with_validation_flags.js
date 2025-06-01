import XLSX from 'xlsx';
import fs from 'fs';
import { db } from './server/db.ts';
import { observations, contributors, species } from './shared/schema.ts';

async function reprocessWithValidationFlags() {
  try {
    console.log('Starting data reprocessing with validation flags...');
    
    // Clear existing data
    await db.delete(observations);
    await db.delete(contributors);
    await db.delete(species);
    console.log('Cleared existing data');
    
    // Read Excel file
    const filePath = './attached_assets/Validated Observations05.30.25.xlsx';
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Processing ${rawData.length} records...`);
    
    // Transform data with validation flags
    const processedObservations = rawData.map(row => {
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
      
      // Check for classification_update flag: has species/variety but missing higher taxonomy
      const hasSpeciesOrVariety = row['Species'] || row['Variety'];
      const missingHigherTaxonomy = hasSpeciesOrVariety && (
        !row['Kingdom'] || !row['Phylum'] || !row['Class'] || 
        !row['Order'] || !row['Family'] || !row['Genus']
      );
      const classificationUpdate = missingHigherTaxonomy;

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
    }).filter(obs => obs.scientificName);
    
    // Insert in batches
    const batchSize = 1000;
    let insertedCount = 0;
    
    console.log(`Processed ${processedObservations.length} valid observations, starting batch insert...`);
    
    for (let i = 0; i < processedObservations.length; i += batchSize) {
      const batch = processedObservations.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(processedObservations.length/batchSize)}`);
      
      await db.insert(observations).values(batch);
      insertedCount += batch.length;
      console.log(`✓ Batch inserted successfully. Total inserted: ${insertedCount}`);
    }
    
    // Count validation flags
    const nameUpdateCount = processedObservations.filter(obs => obs.nameUpdate).length;
    const classificationUpdateCount = processedObservations.filter(obs => obs.classificationUpdate).length;
    
    console.log(`\n=== VALIDATION FLAG SUMMARY ===`);
    console.log(`Total observations: ${insertedCount}`);
    console.log(`Name updates needed: ${nameUpdateCount} (${((nameUpdateCount/insertedCount)*100).toFixed(1)}%)`);
    console.log(`Classification updates needed: ${classificationUpdateCount} (${((classificationUpdateCount/insertedCount)*100).toFixed(1)}%)`);
    console.log(`\nName Update: Flagged when Species OR Variety is missing`);
    console.log(`Classification Update: Flagged when Species/Variety exists but Kingdom, Phylum, Class, Order, Family, or Genus is missing`);
    
    console.log('\nReprocessing completed successfully!');
    
  } catch (error) {
    console.error('Error during reprocessing:', error);
  } finally {
    process.exit(0);
  }
}

reprocessWithValidationFlags();