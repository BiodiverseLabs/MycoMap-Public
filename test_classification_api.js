#!/usr/bin/env tsx

// Test the classification backfill API endpoint
async function testClassificationAPI() {
  try {
    console.log('Testing classification backfill API...');
    
    const response = await fetch('http://localhost:5000/api/classification/backfill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ batchSize: 15 })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('API Response:', JSON.stringify(result, null, 2));
      
      if (result.batchProcessed > 0) {
        console.log(`\n✓ Successfully processed ${result.batchProcessed} genera`);
        console.log(`✓ ${result.batchSuccessful} successful classifications`);
        console.log(`📊 Total progress: ${result.totalProcessed}/1087 (${result.percentComplete}%)`);
        console.log(`🔬 ${result.totalSuccessful} successful taxonomies cached`);
        console.log(`⏳ ${result.remaining} genera remaining`);
      }
    } else {
      console.error('API Error:', response.status, await response.text());
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testClassificationAPI();