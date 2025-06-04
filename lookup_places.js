const { DatabaseStorage } = require('./server/db.js');

async function lookupPlaces() {
  const storage = new DatabaseStorage();
  const placeIds = [1,46,1076,9853,50422,50854,59613,65360,65818,66394,66741,67725,92151,92665,95504,96683,97394,109496,111411,120193,126432,127168,130937,133962,138929,142255,184209,205768];
  
  console.log('Looking up places for state resolution...');
  const state = await storage.resolveStateFromPlaceIds(placeIds);
  console.log('Resolved state:', state);
  
  process.exit(0);
}

lookupPlaces().catch(console.error);