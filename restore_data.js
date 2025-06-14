import { createReadStream } from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function restoreData() {
  console.log('Uploading original Excel file to restore 70,000+ observations...');
  
  try {
    const form = new FormData();
    form.append('file', createReadStream('uploads/restore_original.xlsx'), 'restore_original.xlsx');
    
    const response = await fetch('http://localhost:5000/api/upload-excel', {
      method: 'POST',
      body: form
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Upload successful:', result);
      
      // Wait for processing to complete
      console.log('Waiting for processing to complete...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Check record count
      const statusResponse = await fetch('http://localhost:5000/api/metrics');
      if (statusResponse.ok) {
        const metrics = await statusResponse.json();
        console.log(`Restored ${metrics.totalObservations} observations`);
      }
    } else {
      console.error('Upload failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Restoration error:', error);
  }
}

restoreData();