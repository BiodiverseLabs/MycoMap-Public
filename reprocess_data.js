import XLSX from 'xlsx';
import fs from 'fs';
import { Pool } from '@neondatabase/serverless';

async function reprocessData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Starting data reprocessing...');
    
    // Clear existing data
    await pool.query('DELETE FROM observations');
    await pool.query('DELETE FROM contributors');
    await pool.query('DELETE FROM species');
    console.log('Cleared existing data');
    
    // Read Excel file
    const filePath = 'uploads/068ee69a53f150d7f7d02d85106f9ba6';
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes('validated') || 
      name.toLowerCase().includes('observation')
    ) || workbook.SheetNames[0];
    
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Processing ${rawData.length} records...`);
    console.log('Sample Source Database values:', rawData.slice(0, 3).map(row => row['Source Database']));
    
    // Process in batches
    const batchSize = 1000;
    for (let i = 0; i < rawData.length; i += batchSize) {
      const batch = rawData.slice(i, i + batchSize);
      const observations = batch.map(row => ({
        observationId: row['Reference Number'] || `${Date.now()}-${Math.random()}`,
        scientificName: `${row['Genus'] || ''} ${row['Species'] || ''}`.trim(),
        commonName: null,
        phylum: row['Phylum'] || null,
        class: row['Class'] || null,
        order: row['Order'] || null,
        family: row['Family'] || null,
        genus: row['Genus'] || null,
        species: row['Species'] || null,
        infraspecies: null,
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
        isFirstStateRecord: row['First State Record'] === 'yes',
        hasMultipleGenotypes: row['Multiple Genotypes Under Name'] === 'yes',
        source: row['Source Database'] || row['Source'] || row['source'] || 'Unknown',
        sourceUrl: row['Source URL'] || row['source_url'] || null,
      })).filter(obs => obs.scientificName);
      
      // Insert batch
      for (const obs of observations) {
        await pool.query(`
          INSERT INTO observations (
            observation_id, scientific_name, common_name, phylum, class, "order", family, genus, species,
            infraspecies, observer, collector, observed_on, latitude, longitude, place_guess, state, country,
            genbank_accession, is_first_state_record, has_multiple_genotypes, source, source_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        `, [
          obs.observationId, obs.scientificName, obs.commonName, obs.phylum, obs.class, obs.order,
          obs.family, obs.genus, obs.species, obs.infraspecies, obs.observer, obs.collector,
          obs.observedOn, obs.latitude, obs.longitude, obs.placeGuess, obs.state, obs.country,
          obs.genbankAccession, obs.isFirstStateRecord, obs.hasMultipleGenotypes, obs.source, obs.sourceUrl
        ]);
      }
      
      console.log(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(rawData.length/batchSize)}`);
    }
    
    console.log('Reprocessing completed successfully!');
  } catch (error) {
    console.error('Error reprocessing data:', error);
  } finally {
    await pool.end();
  }
}

reprocessData();