import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

async function testFreshUpload() {
  try {
    console.log('=== TESTING FRESH UPLOAD WITH AUTOMATED CLASSIFICATION UPDATES ===');
    
    // Check if Excel file exists
    const filePath = 'attached_assets/Validated Observations05.30.25.xlsx';
    if (!fs.existsSync(filePath)) {
      console.error('Excel file not found at:', filePath);
      return;
    }
    
    console.log('File found, starting upload...');
    
    // Create form data for upload
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    
    // Upload the file
    console.log('Uploading Excel file...');
    const uploadResponse = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: form
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload initiated:', uploadResult);
    
    const uploadId = uploadResult.uploadId;
    
    // Monitor upload progress
    console.log('Monitoring upload progress...');
    let status = 'processing';
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes timeout
    
    while (status === 'processing' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;
      
      try {
        const statusResponse = await fetch('http://localhost:5000/api/uploads');
        const uploads = await statusResponse.json();
        const currentUpload = uploads.find(u => u.id === uploadId);
        
        if (currentUpload) {
          status = currentUpload.status;
          console.log(`Upload status: ${status} (attempt ${attempts}/${maxAttempts})`);
          
          if (status === 'completed') {
            console.log('✓ Upload completed successfully!');
            break;
          } else if (status === 'failed') {
            console.log('✗ Upload failed');
            return;
          }
        }
      } catch (e) {
        console.log(`Status check failed (attempt ${attempts}): ${e.message}`);
      }
    }
    
    if (status === 'processing') {
      console.log('Upload still processing after timeout');
      return;
    }
    
    // Check the results
    console.log('\n=== CHECKING RESULTS ===');
    
    // Get updated metrics
    const metricsResponse = await fetch('http://localhost:5000/api/metrics');
    const metrics = await metricsResponse.json();
    console.log('Updated metrics:', metrics);
    
    // Check classification updates
    const classificationResponse = await fetch('http://localhost:5000/api/observations/classification-updates');
    const classificationUpdates = await classificationResponse.json();
    console.log(`Classification updates needed: ${classificationUpdates.length}`);
    
    // Check name updates
    const nameResponse = await fetch('http://localhost:5000/api/observations/name-updates');
    const nameUpdates = await nameResponse.json();
    console.log(`Name updates needed: ${nameUpdates.length}`);
    
    console.log('\n=== UPLOAD TEST COMPLETED ===');
    console.log('The automated classification updates should have run during the upload process.');
    console.log('Check the server logs for detailed progress information.');
    
  } catch (error) {
    console.error('Error during upload test:', error);
  }
}

testFreshUpload();