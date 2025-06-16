import { db } from './server/db.ts';
import { observations } from './shared/schema.ts';
import { eq, or, like } from 'drizzle-orm';

async function fixLocationEncoding() {
  try {
    console.log('=== FIXING LOCATION ENCODING ISSUES ===');
    
    // Enhanced character encoding fix function
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
        // Accented characters - comprehensive coverage
        .replace(/Ã¡/g, 'á')     // á with acute accent
        .replace(/Ã©/g, 'é')     // é with acute accent
        .replace(/Ã­/g, 'í')     // í with acute accent
        .replace(/Ã³/g, 'ó')     // ó with acute accent
        .replace(/Ãº/g, 'ú')     // ú with acute accent
        .replace(/Ã±/g, 'ñ')     // ñ with tilde
        .replace(/Ã§/g, 'ç')     // ç with cedilla
        .replace(/Ã¼/g, 'ü')     // ü with diaeresis
        .replace(/Ã¨/g, 'è')     // è with grave accent
        .replace(/Ã /g, 'à')     // à with grave accent
        .replace(/Ã¬/g, 'ì')     // ì with grave accent
        .replace(/Ã²/g, 'ò')     // ò with grave accent
        .replace(/Ã¹/g, 'ù')     // ù with grave accent
        .replace(/Ã¢/g, 'â')     // â with circumflex
        .replace(/Ãª/g, 'ê')     // ê with circumflex
        .replace(/Ã®/g, 'î')     // î with circumflex
        .replace(/Ã´/g, 'ô')     // ô with circumflex
        .replace(/Ã»/g, 'û')     // û with circumflex
        .replace(/Ã¤/g, 'ä')     // ä with diaeresis
        .replace(/Ã«/g, 'ë')     // ë with diaeresis
        .replace(/Ã¯/g, 'ï')     // ï with diaeresis
        .replace(/Ã¶/g, 'ö')     // ö with diaeresis
        .replace(/Ã/g, 'Á')      // Á with acute accent
        .replace(/Ã‰/g, 'É')     // É with acute accent
        .replace(/Ã/g, 'Í')      // Í with acute accent
        .replace(/Ã"/g, 'Ó')     // Ó with acute accent
        .replace(/Ãš/g, 'Ú')     // Ú with acute accent
        .replace(/Ã'/g, 'Ñ')     // Ñ with tilde
        .replace(/Ã‡/g, 'Ç')     // Ç with cedilla
        .replace(/Ãœ/g, 'Ü')     // Ü with diaeresis
        .replace(/Ãˆ/g, 'È')     // È with grave accent
        .replace(/Ã€/g, 'À')     // À with grave accent
        .replace(/ÃŒ/g, 'Ì')     // Ì with grave accent
        .replace(/Ã'/g, 'Ò')     // Ò with grave accent
        .replace(/Ã™/g, 'Ù')     // Ù with grave accent
        .trim();
    }

    // Find all records with location encoding issues
    const recordsWithIssues = await db
      .select()
      .from(observations)
      .where(
        or(
          // Accented character encoding issues in location fields
          like(observations.state, '%Ã¡%'),
          like(observations.state, '%Ã©%'),
          like(observations.state, '%Ã­%'),
          like(observations.state, '%Ã³%'),
          like(observations.state, '%Ãº%'),
          like(observations.state, '%Ã±%'),
          like(observations.state, '%Ã§%'),
          like(observations.state, '%Ã¼%'),
          like(observations.state, '%Ã¨%'),
          like(observations.state, '%Ã %'),
          like(observations.placeGuess, '%Ã¡%'),
          like(observations.placeGuess, '%Ã©%'),
          like(observations.placeGuess, '%Ã­%'),
          like(observations.placeGuess, '%Ã³%'),
          like(observations.placeGuess, '%Ãº%'),
          like(observations.placeGuess, '%Ã±%'),
          like(observations.placeGuess, '%Ã§%'),
          like(observations.placeGuess, '%Ã¼%'),
          like(observations.placeGuess, '%Ã¨%'),
          like(observations.placeGuess, '%Ã %'),
          like(observations.country, '%Ã¡%'),
          like(observations.country, '%Ã©%'),
          like(observations.country, '%Ã­%'),
          like(observations.country, '%Ã³%'),
          like(observations.country, '%Ãº%'),
          like(observations.country, '%Ã±%'),
          like(observations.country, '%Ã§%'),
          like(observations.country, '%Ã¼%'),
          like(observations.country, '%Ã¨%'),
          like(observations.country, '%Ã %')
        )
      );

    console.log(`Found ${recordsWithIssues.length} records with location encoding issues`);

    if (recordsWithIssues.length === 0) {
      console.log('No location encoding issues found!');
      return;
    }

    // Show examples before fixing
    console.log('\nExamples of location issues found:');
    recordsWithIssues.slice(0, 10).forEach((record, index) => {
      console.log(`${index + 1}. ID: ${record.id}`);
      if (record.state && record.state.includes('Ã')) {
        console.log(`   State: "${record.state}" -> "${fixEncoding(record.state)}"`);
      }
      if (record.placeGuess && record.placeGuess.includes('Ã')) {
        console.log(`   Place: "${record.placeGuess}" -> "${fixEncoding(record.placeGuess)}"`);
      }
      if (record.country && record.country.includes('Ã')) {
        console.log(`   Country: "${record.country}" -> "${fixEncoding(record.country)}"`);
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

        // Check and fix location fields
        if (record.state && record.state.includes('Ã')) {
          const fixedState = fixEncoding(record.state);
          if (fixedState !== record.state) {
            updateData.state = fixedState;
            hasChanges = true;
          }
        }

        if (record.placeGuess && record.placeGuess.includes('Ã')) {
          const fixedPlace = fixEncoding(record.placeGuess);
          if (fixedPlace !== record.placeGuess) {
            updateData.placeGuess = fixedPlace;
            hasChanges = true;
          }
        }

        if (record.country && record.country.includes('Ã')) {
          const fixedCountry = fixEncoding(record.country);
          if (fixedCountry !== record.country) {
            updateData.country = fixedCountry;
            hasChanges = true;
          }
        }

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

    console.log(`\n✓ LOCATION ENCODING FIX COMPLETE!`);
    console.log(`Total records processed: ${recordsWithIssues.length}`);
    console.log(`Records fixed: ${fixedCount}`);

    // Verify the fix by checking for remaining location issues
    const remainingIssues = await db
      .select()
      .from(observations)
      .where(
        or(
          like(observations.state, '%Ã¡%'),
          like(observations.state, '%Ã©%'),
          like(observations.state, '%Ã­%'),
          like(observations.state, '%Ã³%'),
          like(observations.state, '%Ãº%'),
          like(observations.placeGuess, '%Ã¡%'),
          like(observations.placeGuess, '%Ã©%'),
          like(observations.placeGuess, '%Ã­%'),
          like(observations.placeGuess, '%Ã³%'),
          like(observations.placeGuess, '%Ãº%'),
          like(observations.country, '%Ã¡%'),
          like(observations.country, '%Ã©%'),
          like(observations.country, '%Ã­%'),
          like(observations.country, '%Ã³%'),
          like(observations.country, '%Ãº%')
        )
      );

    console.log(`\nVerification: ${remainingIssues.length} records still have location encoding issues`);

  } catch (error) {
    console.error('Error fixing location encoding issues:', error);
    throw error;
  }
}

// Run the fix
fixLocationEncoding()
  .then(() => {
    console.log('Location encoding fix completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Location encoding fix failed:', error);
    process.exit(1);
  });