#!/usr/bin/env tsx

// Debug the Amanita search to understand what happened
async function debugAmanitaSearch() {
  console.log('Debugging Amanita family search...\n');
  
  try {
    // Test family search for "Amanita" 
    console.log('=== Testing family search for "Amanita" ===');
    const familySearchUrl = `https://api.inaturalist.org/v1/taxa?q=Amanita&rank=family&per_page=5`;
    console.log(`URL: ${familySearchUrl}`);
    
    const familyResponse = await fetch(familySearchUrl);
    
    if (familyResponse.ok) {
      const familyData = await familyResponse.json();
      console.log(`Results: ${familyData.results?.length || 0}`);
      
      if (familyData.results && familyData.results.length > 0) {
        familyData.results.forEach((result, index) => {
          console.log(`[${index + 1}] ${result.name} (ID: ${result.id}, Rank: ${result.rank})`);
        });
      }
    }
    
    // Test genus search for "Amanita" (correct approach)
    console.log('\n=== Testing genus search for "Amanita" (correct) ===');
    const genusSearchUrl = `https://api.inaturalist.org/v1/taxa?q=Amanita&rank=genus&per_page=5`;
    console.log(`URL: ${genusSearchUrl}`);
    
    const genusResponse = await fetch(genusSearchUrl);
    
    if (genusResponse.ok) {
      const genusData = await genusResponse.json();
      console.log(`Results: ${genusData.results?.length || 0}`);
      
      if (genusData.results && genusData.results.length > 0) {
        for (const result of genusData.results) {
          console.log(`\nFound: ${result.name} (ID: ${result.id}, Rank: ${result.rank})`);
          
          // Get detailed taxonomy
          const detailUrl = `https://api.inaturalist.org/v1/taxa/${result.id}`;
          const detailResponse = await fetch(detailUrl);
          
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            const taxon = detailData.results?.[0];
            
            if (taxon && taxon.ancestors) {
              const taxonomy = {};
              
              if (taxon.rank && taxon.name) {
                taxonomy[taxon.rank] = taxon.name;
              }
              
              taxon.ancestors.forEach(ancestor => {
                if (ancestor.rank && ancestor.name) {
                  taxonomy[ancestor.rank] = ancestor.name;
                }
              });
              
              console.log(`Taxonomy for ${result.name}:`);
              console.log(`  Kingdom: ${taxonomy.kingdom || 'N/A'}`);
              console.log(`  Phylum: ${taxonomy.phylum || 'N/A'}`);
              console.log(`  Class: ${taxonomy.class || 'N/A'}`);
              console.log(`  Order: ${taxonomy.order || 'N/A'}`);
              console.log(`  Family: ${taxonomy.family || 'N/A'}`);
              console.log(`  Genus: ${taxonomy.genus || 'N/A'}`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugAmanitaSearch().catch(console.error);