import { DatabaseStorage } from './server/db.js';

async function resyncMOData() {
  const db = new DatabaseStorage();
  
  console.log('Re-syncing MO observation 571812 with corrected parsing...');
  
  try {
    const result = await db.syncObservationWithMushroomObserver('571812');
    console.log('Sync result:', JSON.stringify(result, null, 2));
    
    // Verify the updated data
    const moData = await db.getMushroomObserverData('571812');
    console.log('Updated MO data:', JSON.stringify(moData, null, 2));
    
  } catch (error) {
    console.error('Error during sync:', error);
  }
  
  process.exit(0);
}

resyncMOData();