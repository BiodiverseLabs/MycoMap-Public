import { db } from './server/db.js';
import { observations } from './shared/schema.js';
import { eq, or, like } from 'drizzle-orm';

async function fixEncodingIssues() {
  try {
    console.log('=== FIXING CHARACTER ENCODING ISSUES ===');
    
    // Character encoding fix function
    function fixEncoding(text) {
      if (!text || typeof text !== 'string') return text;
      
      return text
        // Smart quotes and apostrophes
        .replace(/â€œ/g, '"')     // Opening smart quote
        .replace(/â€/g, '"')      // Closing smart quote  
        .replace(/â€™/g, "'")     // Smart apostrophe/closing single quote
        .replace(/â€˜/g, "'")     // Opening smart apostrophe
        // Other common encoding issues
        .replace(/â€"/g, '–')     // En dash
        .replace(/â€"/g, '—')     // Em dash
        .replace(/â€¦/g, '…')     // Ellipsis
        .replace(/Ã¡/g, 'á')     // á with accent
        .replace(/Ã©/g, 'é')     // é with accent
        .replace(/Ã­/g, 'í')     // í with accent
        .replace(/Ã³/g, 'ó')     // ó with accent
        .replace(/Ãº/g, 'ú')     // ú with accent
        .replace(/Ã±/g, 'ñ')     // ñ with tilde
        .replace(/Ã§/g, 'ç')     // ç with cedilla
        // Additional patterns found in the data
        .replace(/â€˜/g, "'")     // Additional single quote variant
        .replace(/â€™/g, "'")     // Additional apostrophe variant
        .trim();
    }

    // Find all records with encoding issues
    const recordsWithIssues = await db
      .select()
      .from(observations)
      .where(
        or(
          like(observations.scientificName, '%â€œ%'),
          like(observations.scientificName, '%â€%'),
          like(observations.scientificName, '%â€™%'),
          like(observations.scientificName, '%â€˜%'),
          like(observations.collector, '%â€œ%'),
          like(observations.collector, '%â€%'),
          like(observations.collector, '%â€™%'),
          like(observations.collector, '%â€˜%'),
          like(observations.state, '%â€œ%'),
          like(observations.state, '%â€%'),
          like(observations.state, '%â€™%'),
          like(observations.state, '%â€˜%'),
          like(observations.phylum, '%â€œ%'),
          like(observations.phylum, '%â€%'),
          like(observations.phylum, '%â€™%'),
          like(observations.phylum, '%â€˜%'),
          like(observations.class, '%â€œ%'),
          like(observations.class, '%â€%'),
          like(observations.class, '%â€™%'),
          like(observations.class, '%â€˜%'),
          like(observations.order, '%â€œ%'),
          like(observations.order, '%â€%'),
          like(observations.order, '%â€™%'),
          like(observations.order, '%â€˜%'),
          like(observations.family, '%â€œ%'),
          like(observations.family, '%â€%'),
          like(observations.family, '%â€™%'),
          like(observations.family, '%â€˜%'),
          like(observations.genus, '%â€œ%'),
          like(observations.genus, '%â€%'),
          like(observations.genus, '%â€™%'),
          like(observations.genus, '%â€˜%'),
          like(observations.species, '%â€œ%'),
          like(observations.species, '%â€%'),
          like(observations.species, '%â€™%'),
          like(observations.species, '%â€˜%'),
          like(observations.infraspecies, '%â€œ%'),
          like(observations.infraspecies, '%â€%'),
          like(observations.infraspecies, '%â€™%'),
          like(observations.infraspecies, '%â€˜%'),
          like(observations.authority, '%â€œ%'),
          like(observations.authority, '%â€%'),
          like(observations.authority, '%â€™%'),
          like(observations.authority, '%â€˜%'),
          like(observations.placeGuess, '%â€œ%'),
          like(observations.placeGuess, '%â€%'),
          like(observations.placeGuess, '%â€™%'),
          like(observations.placeGuess, '%â€˜%'),
          like(observations.country, '%â€œ%'),
          like(observations.country, '%â€%'),
          like(observations.country, '%â€™%'),
          like(observations.country, '%â€˜%'),
          like(observations.notes, '%â€œ%'),
          like(observations.notes, '%â€%'),
          like(observations.notes, '%â€™%'),
          like(observations.notes, '%â€˜%'),
          like(observations.locationName, '%â€œ%'),
          like(observations.locationName, '%â€%'),
          like(observations.locationName, '%â€™%'),
          like(observations.locationName, '%â€˜%')
        )
      );

    console.log(`Found ${recordsWithIssues.length} records with encoding issues`);

    if (recordsWithIssues.length === 0) {
      console.log('No encoding issues found!');
      return;
    }

    // Show examples before fixing
    console.log('\nExamples of issues found:');
    recordsWithIssues.slice(0, 5).forEach((record, index) => {
      console.log(`${index + 1}. ID: ${record.id}`);
      if (record.scientificName && (record.scientificName.includes('â€œ') || record.scientificName.includes('â€') || record.scientificName.includes('â€™'))) {
        console.log(`   Scientific Name: "${record.scientificName}" -> "${fixEncoding(record.scientificName)}"`);
      }
      if (record.collector && (record.collector.includes('â€œ') || record.collector.includes('â€') || record.collector.includes('â€™'))) {
        console.log(`   Collector: "${record.collector}" -> "${fixEncoding(record.collector)}"`);
      }
      if (record.state && (record.state.includes('â€œ') || record.state.includes('â€') || record.state.includes('â€™'))) {
        console.log(`   State: "${record.state}" -> "${fixEncoding(record.state)}"`);
      }
      console.log('');
    });

    // Process in batches
    let fixedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < recordsWithIssues.length; i += batchSize) {
      const batch = recordsWithIssues.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recordsWithIssues.length / batchSize)} (${batch.length} records)`);
      
      for (const record of batch) {
        // Build update object with only fields that need fixing
        const updateData = {};
        let hasChanges = false;

        // Check and fix each text field
        const fieldsToCheck = [
          'scientificName', 'collector', 'state', 'phylum', 'class', 'order', 
          'family', 'genus', 'species', 'infraspecies', 'authority', 
          'placeGuess', 'country', 'notes', 'locationName', 'observer',
          'kingdom', 'abbreviatedAuthority', 'verified', 'mycobankNumber',
          'fungariumSpecimen', 'images', 'flags', 'forwardPrimer', 
          'reversePrimer', 'runName', 'sequence2', 'forwardPrimer2',
          'reversePrimer2', 'sequenceOwner2', 'runName2', 'moNotes'
        ];

        fieldsToCheck.forEach(field => {
          const originalValue = record[field];
          if (originalValue && typeof originalValue === 'string') {
            const fixedValue = fixEncoding(originalValue);
            if (fixedValue !== originalValue) {
              updateData[field] = fixedValue;
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          await db
            .update(observations)
            .set(updateData)
            .where(eq(observations.id, record.id));
          
          fixedCount++;
        }
      }
      
      console.log(`Batch complete. Total fixed so far: ${fixedCount}`);
      
      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n✓ ENCODING FIX COMPLETE!`);
    console.log(`Total records processed: ${recordsWithIssues.length}`);
    console.log(`Records fixed: ${fixedCount}`);
    console.log(`Records that didn't need fixing: ${recordsWithIssues.length - fixedCount}`);

    // Verify the fix by checking for remaining issues
    const remainingIssues = await db
      .select()
      .from(observations)
      .where(
        or(
          like(observations.scientificName, '%â€œ%'),
          like(observations.scientificName, '%â€%'),
          like(observations.scientificName, '%â€™%'),
          like(observations.collector, '%â€œ%'),
          like(observations.collector, '%â€%'),
          like(observations.collector, '%â€™%'),
          like(observations.state, '%â€œ%'),
          like(observations.state, '%â€%'),
          like(observations.state, '%â€™%')
        )
      );

    console.log(`\nVerification: ${remainingIssues.length} records still have encoding issues`);
    
    if (remainingIssues.length > 0) {
      console.log('Remaining issues (first 3):');
      remainingIssues.slice(0, 3).forEach(record => {
        console.log(`ID: ${record.id}, Scientific Name: "${record.scientificName}", Collector: "${record.collector}", State: "${record.state}"`);
      });
    }

  } catch (error) {
    console.error('Error fixing encoding issues:', error);
    throw error;
  }
}

// Run the fix
fixEncodingIssues()
  .then(() => {
    console.log('Encoding fix completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Encoding fix failed:', error);
    process.exit(1);
  });