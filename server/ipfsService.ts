import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { promises as fs } from 'fs';
import path from 'path';

interface IPFSUploadResult {
  success: boolean;
  cid?: string;
  ipfsUrl?: string;
  error?: string;
}

interface ObservationFiles {
  observationId: string;
  ncbiBlastFile?: string;
  localBlastFile?: string;
  fastqFile?: string;
  inatApiFile?: string;
}

export class IPFSService {
  private helia: any;
  private unixfsInstance: any;
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('[IPFS] Initializing Helia node...');
      this.helia = await createHelia();
      this.unixfsInstance = unixfs(this.helia);
      this.initialized = true;
      console.log('[IPFS] Helia node initialized successfully');
    } catch (error) {
      console.error('[IPFS] Failed to initialize Helia node:', error);
    }
  }

  private async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;
    
    // Wait up to 30 seconds for initialization
    const maxWait = 30000;
    const startTime = Date.now();
    
    while (!this.initialized && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return this.initialized;
  }

  /**
   * Upload a single file to IPFS
   */
  async uploadFile(filePath: string): Promise<IPFSUploadResult> {
    try {
      if (!(await this.ensureInitialized())) {
        return { success: false, error: 'IPFS node not initialized' };
      }

      console.log(`[IPFS] Uploading file: ${filePath}`);
      
      // Check if file exists
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      // Read file content
      const fileContent = await fs.readFile(filePath);
      
      // Upload to IPFS
      const cid = await this.unixfsInstance.addFile({
        content: fileContent,
        path: path.basename(filePath)
      });

      const ipfsUrl = `https://ipfs.io/ipfs/${cid}`;
      
      console.log(`[IPFS] File uploaded successfully: ${ipfsUrl}`);
      
      return {
        success: true,
        cid: cid.toString(),
        ipfsUrl
      };
    } catch (error) {
      console.error(`[IPFS] Failed to upload file ${filePath}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  /**
   * Upload all files for a validated observation to IPFS
   */
  async uploadObservationFiles(files: ObservationFiles): Promise<{
    success: boolean;
    ipfsLinks?: {
      ncbiBlast?: string;
      localBlast?: string;
      fastq?: string;
      inatApi?: string;
      folder?: string;
    };
    error?: string;
  }> {
    try {
      if (!(await this.ensureInitialized())) {
        return { success: false, error: 'IPFS node not initialized' };
      }

      console.log(`[IPFS] Uploading observation files for ${files.observationId}`);
      
      const uploadResults: any = {};
      const fileUploads: Array<{ path: string; content: Uint8Array }> = [];

      // Prepare all files for batch upload
      const fileMapping = {
        ncbiBlast: files.ncbiBlastFile ? path.join(process.cwd(), 'downloads', 'blast', files.ncbiBlastFile) : null,
        localBlast: files.localBlastFile ? path.join(process.cwd(), 'downloads', 'blast', files.localBlastFile) : null,
        fastq: files.fastqFile ? path.join(process.cwd(), 'downloads', 'trace', files.fastqFile) : null,
        inatApi: files.inatApiFile ? path.join(process.cwd(), 'downloads', 'inat_api', files.inatApiFile) : null,
      };

      // Read and prepare files for upload
      for (const [key, filePath] of Object.entries(fileMapping)) {
        if (filePath) {
          try {
            const exists = await fs.access(filePath).then(() => true).catch(() => false);
            if (exists) {
              const content = await fs.readFile(filePath);
              fileUploads.push({
                path: `observation-${files.observationId}/${path.basename(filePath)}`,
                content
              });
              console.log(`[IPFS] Prepared ${key} file: ${path.basename(filePath)}`);
            } else {
              console.warn(`[IPFS] File not found: ${filePath}`);
            }
          } catch (error) {
            console.error(`[IPFS] Error reading ${key} file:`, error);
          }
        }
      }

      if (fileUploads.length === 0) {
        return { success: false, error: 'No valid files found to upload' };
      }

      // Upload files as a directory
      const folderCid = await this.unixfsInstance.addDirectory(fileUploads);
      const folderUrl = `https://ipfs.io/ipfs/${folderCid}`;

      // Also upload individual files for direct access
      const ipfsLinks: any = { folder: folderUrl };
      
      for (const fileUpload of fileUploads) {
        try {
          const fileCid = await this.unixfsInstance.addFile({
            content: fileUpload.content,
            path: path.basename(fileUpload.path)
          });
          
          const fileName = path.basename(fileUpload.path);
          const fileType = this.getFileType(fileName, files);
          if (fileType) {
            ipfsLinks[fileType] = `https://ipfs.io/ipfs/${fileCid}`;
          }
        } catch (error) {
          console.error(`[IPFS] Failed to upload individual file ${fileUpload.path}:`, error);
        }
      }

      console.log(`[IPFS] Successfully uploaded observation ${files.observationId} to IPFS`);
      console.log(`[IPFS] Folder URL: ${folderUrl}`);
      
      return {
        success: true,
        ipfsLinks
      };
    } catch (error) {
      console.error(`[IPFS] Failed to upload observation files:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  private getFileType(fileName: string, files: ObservationFiles): string | null {
    if (files.ncbiBlastFile && fileName.includes(files.ncbiBlastFile)) return 'ncbiBlast';
    if (files.localBlastFile && fileName.includes(files.localBlastFile)) return 'localBlast';
    if (files.fastqFile && fileName.includes(files.fastqFile)) return 'fastq';
    if (files.inatApiFile && fileName.includes(files.inatApiFile)) return 'inatApi';
    return null;
  }

  /**
   * Shutdown the IPFS node
   */
  async shutdown() {
    if (this.helia) {
      try {
        await this.helia.stop();
        console.log('[IPFS] Helia node stopped');
      } catch (error) {
        console.error('[IPFS] Error stopping Helia node:', error);
      }
    }
  }
}

// Export singleton instance
export const ipfsService = new IPFSService();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('[IPFS] Shutting down IPFS service...');
  await ipfsService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[IPFS] Shutting down IPFS service...');
  await ipfsService.shutdown();
  process.exit(0);
});