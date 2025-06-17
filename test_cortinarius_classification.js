import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function testCortinariusClassification() {
  console.log('=== Testing Cortinarius Classification Logic ===\n');
  
  // 1. Check the specific record
  console.log('1. Cortinarius watsoneae record status:');
  const cortinariusRecord = await db.execute(sql`
    SELECT id, observation_id, scientific_name, species, genus, phylum, class, "order", family, classification_update
    FROM observations 
    WHERE scientific_name = 'Cortinarius watsoneae'
    LIMIT 1
  `);
  
  if (cortinariusRecord.rows.length > 0) {
    const record = cortinariusRecord.rows[0];
    console.log(`   Record ID: ${record.id}`);
    console.log(`   Scientific Name: ${record.scientific_name}`);
    console.log(`   Current Genus: ${record.genus || 'NULL'}`);
    console.log(`   Current Taxonomy: ${record.phylum || 'NULL'} > ${record.class || 'NULL'} > ${record.order || 'NULL'} > ${record.family || 'NULL'}`);
    console.log(`   Needs Classification Update: ${record.classification_update}`);
  }
  
  // 2. Test genus extraction logic
  console.log('\n2. Testing genus extraction:');
  function extractGenus(scientificName, species, genus) {
    // Use existing genus if available
    if (genus && genus.trim() !== '') {
      return genus.trim();
    }
    
    // Extract from scientific name
    if (scientificName && scientificName.trim() !== '') {
      const parts = scientificName.trim().split(' ');
      if (parts.length >= 1 && parts[0] !== '') {
        return parts[0];
      }
    }
    
    // Extract from species field
    if (species && species.trim() !== '') {
      const parts = species.trim().split(' ');
      if (parts.length >= 1 && parts[0] !== '') {
        return parts[0];
      }
    }
    
    return null;
  }
  
  const extractedGenus = extractGenus('Cortinarius watsoneae', 'Cortinarius watsoneae', '');
  console.log(`   Extracted genus from "Cortinarius watsoneae": "${extractedGenus}"`);
  
  // 3. Check reference taxonomy data
  console.log('\n3. Reference taxonomy for Cortinarius:');
  const referenceData = await db.execute(sql`
    SELECT phylum, class, "order", family, COUNT(*) as count
    FROM observations 
    WHERE genus = 'Cortinarius' 
      AND phylum IS NOT NULL AND phylum != ''
      AND class IS NOT NULL AND class != ''
      AND "order" IS NOT NULL AND "order" != ''
      AND family IS NOT NULL AND family != ''
    GROUP BY phylum, class, "order", family
    ORDER BY count DESC
    LIMIT 1
  `);
  
  if (referenceData.rows.length > 0) {
    const ref = referenceData.rows[0];
    console.log(`   Available reference: ${ref.phylum} > ${ref.class} > ${ref.order} > ${ref.family} (${ref.count} records)`);
    console.log('   ✓ Reference taxonomy data exists and should have been used');
  } else {
    console.log('   ✗ No reference taxonomy data found');
  }
  
  // 4. Test the classification update logic manually
  console.log('\n4. Simulating classification update:');
  if (extractedGenus === 'Cortinarius' && referenceData.rows.length > 0) {
    const ref = referenceData.rows[0];
    console.log(`   Should update with: ${ref.phylum} > ${ref.class} > ${ref.order} > ${ref.family}`);
    
    // Test the actual update
    const updateResult = await db.execute(sql`
      UPDATE observations 
      SET phylum = ${ref.phylum}, 
          class = ${ref.class}, 
          "order" = ${ref.order}, 
          family = ${ref.family},
          genus = 'Cortinarius',
          classification_update = false
      WHERE scientific_name = 'Cortinarius watsoneae'
      RETURNING id, phylum, class, "order", family
    `);
    
    if (updateResult.rows.length > 0) {
      const updated = updateResult.rows[0];
      console.log(`   ✓ Successfully updated record ${updated.id}`);
      console.log(`   New taxonomy: ${updated.phylum} > ${updated.class} > ${updated.order} > ${updated.family}`);
    } else {
      console.log('   ✗ Update failed');
    }
  }
  
  // 5. Check classification cache
  console.log('\n5. iNaturalist classification cache:');
  const cacheData = await db.execute(sql`
    SELECT genus, phylum, class, "order", family
    FROM inaturalist_classification_cache 
    WHERE genus = 'Cortinarius'
    LIMIT 1
  `);
  
  if (cacheData.rows.length > 0) {
    const cache = cacheData.rows[0];
    console.log(`   Cached: ${cache.phylum} > ${cache.class} > ${cache.order} > ${cache.family}`);
  } else {
    console.log('   No cached iNaturalist data for Cortinarius');
  }
  
  console.log('\n=== Analysis Complete ===');
  process.exit(0);
}

testCortinariusClassification().catch(console.error);