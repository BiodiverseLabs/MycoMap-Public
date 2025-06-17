#!/usr/bin/env tsx

// Debug the API lookup for known fungal genera
async function debugApiLookup() {
  console.log('Debugging API lookup for known fungal genera...\n');
  
  const testGenera = ['Armillaria', 'Arrhenia', 'Arachnopeziza', 'Aspergillus'];
  
  for (const genus of testGenera) {
    console.log(`\n=== Testing "${genus}" ===`);
    
    try {
      // Test basic search
      const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(genus)}&rank=genus,subgenus,family&per_page=3`;
      console.log(`Search URL: ${searchUrl}`);
      
      const response = await fetch(searchUrl);
      console.log(`Search response: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Results found: ${data.results?.length || 0}`);
        
        if (data.results && data.results.length > 0) {
          for (let i = 0; i < Math.min(data.results.length, 2); i++) {
            const result = data.results[i];
            console.log(`\nResult ${i + 1}:`);
            console.log(`  ID: ${result.id}`);
            console.log(`  Name: ${result.name}`);
            console.log(`  Rank: ${result.rank}`);
            console.log(`  Ancestors: ${result.ancestors?.length || 0}`);
            
            if (result.ancestors && result.ancestors.length > 0) {
              // Get detailed taxonomy
              const detailUrl = `https://api.inaturalist.org/v1/taxa/${result.id}`;
              const detailResponse = await fetch(detailUrl);
              
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                const taxon = detailData.results?.[0];
                
                if (taxon && taxon.ancestors) {
                  const taxonomy = {};
                  
                  // Extract taxonomy from taxon and ancestors
                  [taxon, ...taxon.ancestors].forEach(ancestor => {
                    if (ancestor.rank && ancestor.name) {
                      taxonomy[ancestor.rank] = ancestor.name;
                    }
                  });
                  
                  console.log(`  Detailed taxonomy:`);
                  console.log(`    Kingdom: ${taxonomy.kingdom || 'N/A'}`);
                  console.log(`    Phylum: ${taxonomy.phylum || 'N/A'}`);
                  console.log(`    Class: ${taxonomy.class || 'N/A'}`);
                  console.log(`    Order: ${taxonomy.order || 'N/A'}`);
                  console.log(`    Family: ${taxonomy.family || 'N/A'}`);
                  console.log(`    Genus: ${taxonomy.genus || 'N/A'}`);
                  
                  // Check if it meets our criteria
                  const isComplete = taxonomy.kingdom && taxonomy.family;
                  console.log(`  Complete taxonomy? ${isComplete ? 'YES' : 'NO'}`);
                  
                  if (isComplete) {
                    console.log(`  ✅ This should be successfully classified!`);
                  } else {
                    console.log(`  ❌ Missing required fields (kingdom and family)`);
                  }
                } else {
                  console.log(`  No detailed taxon data available`);
                }
              } else {
                console.log(`  Detail API failed: ${detailResponse.status}`);
              }
            } else {
              console.log(`  No ancestors available`);
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          console.log(`  No results found for ${genus}`);
        }
      } else {
        console.log(`  Search API failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error(`Error testing ${genus}:`, error.message);
    }
    
    // Delay between genera
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

debugApiLookup().catch(console.error);