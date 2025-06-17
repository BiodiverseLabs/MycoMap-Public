#!/usr/bin/env node

const { DatabaseStorage } = require('./server/db.js');

async function diagnoseCortinariusClassification() {
  console.log('=== Cortinarius Classification Diagnosis ===\n');
  
  const storage = new DatabaseStorage();
  
  // 1. Check the specific Cortinarius watsoneae record
  console.log('1. Checking Cortinarius watsoneae record:');
  const cortinariusRecords = await storage.db.execute(`
    SELECT id, observation_id, scientific_name, species, genus, phylum, class, "order", family, classification_update, updated_at
    FROM observations 
    WHERE scientific_name = 'Cortinarius watsoneae'
    ORDER BY updated_at DESC
    LIMIT 3
  `);
  
  cortinariusRecords.rows.forEach(record => {
    console.log(`  ID: ${record.id}, Genus: ${record.genus || 'NULL'}, Classification Update: ${record.classification_update}`);
    console.log(`  Taxonomy: ${record.phylum || 'NULL'} > ${record.class || 'NULL'} > ${record.order || 'NULL'} > ${record.family || 'NULL'}`);
    console.log(`  Updated: ${record.updated_at}\n`);
  });
  
  // 2. Check reference taxonomy for Cortinarius
  console.log('2. Checking reference taxonomy for Cortinarius genus:');
  const referenceData = await storage.db.execute(`
    SELECT phylum, class, "order", family, COUNT(*) as count
    FROM observations 
    WHERE genus = 'Cortinarius' 
      AND phylum IS NOT NULL AND phylum != ''
      AND class IS NOT NULL AND class != ''
      AND "order" IS NOT NULL AND "order" != ''
      AND family IS NOT NULL AND family != ''
    GROUP BY phylum, class, "order", family
    ORDER BY count DESC
    LIMIT 3
  `);
  
  referenceData.rows.forEach(ref => {
    console.log(`  ${ref.phylum} > ${ref.class} > ${ref.order} > ${ref.family} (${ref.count} records)`);
  });
  
  // 3. Test the genus extraction logic
  console.log('\n3. Testing genus extraction from "Cortinarius watsoneae":');
  
  function extractGenus(scientificName, species, genusField) {
    if (genusField && genusField.trim() !== '') {
      return genusField.trim();
    }
    
    if (scientificName && scientificName.trim() !== '') {
      const parts = scientificName.trim().split(' ');
      if (parts.length >= 1) {
        return parts[0];
      }
    }
    
    if (species && species.trim() !== '') {
      const parts = species.trim().split(' ');
      if (parts.length >= 1) {
        return parts[0];
      }
    }
    
    return null;
  }
  
  const testGenus = extractGenus('Cortinarius watsoneae', 'Cortinarius watsoneae', '');
  console.log(`  Extracted genus: "${testGenus}"`);
  
  // 4. Check if classification cache has Cortinarius
  console.log('\n4. Checking iNaturalist classification cache for Cortinarius:');
  const cacheResults = await storage.db.execute(`
    SELECT genus, phylum, class, "order", family, cached_at
    FROM inaturalist_classification_cache 
    WHERE genus = 'Cortinarius'
    LIMIT 3
  `);
  
  if (cacheResults.rows.length > 0) {
    cacheResults.rows.forEach(cache => {
      console.log(`  Cached: ${cache.phylum} > ${cache.class} > ${cache.order} > ${cache.family}`);
      console.log(`  Cached at: ${cache.cached_at}`);
    });
  } else {
    console.log('  No cached results for Cortinarius genus');
  }
  
  // 5. Check the most recent upload and its processing
  console.log('\n5. Checking recent upload processing:');
  const recentUpload = await storage.db.execute(`
    SELECT id, filename, status, updated_at
    FROM uploads 
    ORDER BY updated_at DESC 
    LIMIT 1
  `);
  
  if (recentUpload.rows.length > 0) {
    const upload = recentUpload.rows[0];
    console.log(`  Most recent upload: ID ${upload.id}, File: ${upload.filename}, Status: ${upload.status}`);
    
    // Check if Cortinarius watsoneae was in this upload
    const uploadRecords = await storage.db.execute(`
      SELECT COUNT(*) as count
      FROM observations 
      WHERE scientific_name = 'Cortinarius watsoneae'
        AND updated_at >= '${upload.updated_at}'::timestamp - interval '1 hour'
    `);
    
    console.log(`  Cortinarius watsoneae records in recent upload: ${uploadRecords.rows[0].count}`);
  }
  
  console.log('\n=== Diagnosis Complete ===');
  process.exit(0);
}

diagnoseCortinariusClassification().catch(console.error);