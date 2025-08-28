#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function calculateStateFirstRecords() {
  console.log('=== CALCULATE STATE FIRST RECORDS ===');
  console.log('Identifying true first occurrence of each species in each state...\n');

  try {
    // Step 1: Reset all state first record flags
    console.log('Step 1: Resetting all is_first_state_record flags...');
    const resetResult = await sql`
      UPDATE observations 
      SET is_first_state_record = false
    `;
    console.log(`✓ Reset ${resetResult.length} records\n`);

    // Step 2: Get IDs of actual state first records  
    console.log('Step 2: Finding state first record IDs...');
    
    const stateFirstIds = await sql`
      WITH state_firsts AS (
        SELECT 
          scientific_name,
          state,
          MIN(creation_date) as first_date
        FROM observations 
        WHERE scientific_name IS NOT NULL 
          AND scientific_name != '' 
          AND scientific_name != 'Fungi'
          AND state IS NOT NULL 
          AND state != ''
          AND creation_date IS NOT NULL
        GROUP BY scientific_name, state
      )
      SELECT DISTINCT o.id
      FROM observations o
      INNER JOIN state_firsts sf ON (
        o.scientific_name = sf.scientific_name 
        AND o.state = sf.state 
        AND o.creation_date = sf.first_date
      )
      WHERE o.scientific_name IS NOT NULL 
        AND o.scientific_name != '' 
        AND o.scientific_name != 'Fungi'
        AND o.state IS NOT NULL 
        AND o.state != ''
        AND o.creation_date IS NOT NULL
    `;

    console.log(`✓ Found ${stateFirstIds.length} state first records`);

    // Step 3: Update records in batches
    console.log('Step 3: Updating state first record flags...');
    if (stateFirstIds.length > 0) {
      const ids = stateFirstIds.map(row => row.id);
      const updateResult = await sql`
        UPDATE observations 
        SET is_first_state_record = true 
        WHERE id = ANY(${ids})
      `;
      console.log(`✓ Updated ${updateResult.length} records`);
    }
    console.log(`✓ Updated state first records\n`);

    // Step 4: Verify results
    console.log('Step 4: Verification...');
    
    const [totalStateFirsts] = await sql`
      SELECT COUNT(*) as count 
      FROM observations 
      WHERE is_first_state_record = true
    `;
    
    const [uniqueCombos] = await sql`
      SELECT COUNT(DISTINCT (scientific_name, state)) as count
      FROM observations 
      WHERE scientific_name IS NOT NULL 
        AND scientific_name != '' 
        AND scientific_name != 'Fungi'
        AND state IS NOT NULL 
        AND state != ''
        AND creation_date IS NOT NULL
    `;

    console.log(`✓ Total state first records: ${totalStateFirsts.count}`);
    console.log(`✓ Expected unique combos: ${uniqueCombos.count}`);
    console.log(`✓ Match ratio: ${(totalStateFirsts.count / uniqueCombos.count * 100).toFixed(1)}%\n`);

    // Step 5: Show top collectors of state firsts
    const topCollectors = await sql`
      SELECT 
        collector,
        COUNT(*) as state_firsts
      FROM observations 
      WHERE is_first_state_record = true
      GROUP BY collector
      ORDER BY state_firsts DESC
      LIMIT 10
    `;

    console.log('Top Collectors of State First Records:');
    console.log('=====================================');
    topCollectors.forEach((collector, index) => {
      console.log(`${index + 1}. ${collector.collector}: ${collector.state_firsts} state firsts`);
    });

    console.log('\n🎉 State first records calculation complete!');
    
  } catch (error) {
    console.error('❌ Error calculating state first records:', error);
    process.exit(1);
  }
}

// Run the calculation
calculateStateFirstRecords().then(() => {
  process.exit(0);
});