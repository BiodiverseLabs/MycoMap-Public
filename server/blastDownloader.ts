import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';

export interface BlastDownloadResult {
  success: boolean;
  ncbiPath?: string;
  localPath?: string;
  error?: string;
}

export interface TraceDownloadResult {
  success: boolean;
  fastqPath?: string;
  error?: string;
}

export interface InatApiSaveResult {
  success: boolean;
  apiFilePath?: string;
  error?: string;
}

export class BlastFileDownloader {
  private downloadDir = path.join(process.cwd(), 'downloads', 'blast');
  private traceDir = path.join(process.cwd(), 'downloads', 'trace');
  private inatApiDir = path.join(process.cwd(), 'downloads', 'inat_api');

  constructor() {
    this.ensureDownloadDir();
  }

  private async ensureDownloadDir() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      await fs.mkdir(this.traceDir, { recursive: true });
      await fs.mkdir(this.inatApiDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create download directories:', error);
    }
  }

  /**
   * Parse MycoMap trace URL to extract FASTQ file URL
   * Example URL: https://mycomap.com/genetics/sequences/ont_sequences/hfsont33_its4-5_95-dik-s-pl04-mgk04-ns4918-inat265571056-basidio-1-ric499-r358689/
   */
  private async parseTracePageForFiles(traceUrl: string): Promise<{ fastqUrl?: string }> {
    try {
      console.log(`[TRACE] Parsing page: ${traceUrl}`);
      
      const response = await fetch(traceUrl);
      if (!response.ok) {
        console.error(`[TRACE] Failed to fetch page: ${response.status} ${response.statusText}`);
        return {};
      }

      const html = await response.text();
      
      // Look for Assembly Files pattern like "Assembly Files: filename.fastq"
      const fastqMatch = html.match(/Assembly Files:\s*<a[^>]*href="([^"]*\.fastq)"[^>]*>([^<]*\.fastq)<\/a>/i);

      let fastqUrl;
      
      if (fastqMatch) {
        fastqUrl = fastqMatch[1];
        // Decode HTML entities like &amp; -> &
        fastqUrl = fastqUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        
        // Handle relative URLs
        if (fastqUrl.startsWith('/')) {
          fastqUrl = `https://mycomap.com${fastqUrl}`;
        } else if (!fastqUrl.startsWith('http')) {
          const baseUrl = traceUrl.replace(/\/$/, '');
          fastqUrl = `${baseUrl}/${fastqUrl}`;
        }
        console.log(`[TRACE] Decoded FASTQ URL: ${fastqUrl}`);
      }

      console.log(`[TRACE] Found FASTQ file: ${fastqUrl}`);
      return { fastqUrl };
    } catch (error) {
      console.error(`[TRACE] Failed to parse page ${traceUrl}:`, error);
      return {};
    }
  }

  /**
   * Parse MycoMap BLAST URL to extract file URLs
   * Example URL: https://mycomap.com/genetics/blast-search/hfsont33_its4-5_95-dik-s-pl04-mgk04-ns4918-inat265571056-basidio-1-ric499-358689-r284591/
   */
  private async parseBlastPageForFiles(blastUrl: string): Promise<{ ncbiUrl?: string; localUrl?: string }> {
    try {
      console.log(`[BLAST] Fetching page: ${blastUrl}`);
      const response = await fetch(blastUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Extract file URLs from the HTML
      // Look for patterns like "NCBI Results: filename.xml" and "Local Results: filename.xml"
      const ncbiMatch = html.match(/NCBI Results:\s*<a[^>]*href="([^"]*\.xml)"[^>]*>([^<]*\.xml)<\/a>/i);
      const localMatch = html.match(/Local Results:\s*<a[^>]*href="([^"]*\.xml)"[^>]*>([^<]*\.xml)<\/a>/i);

      let ncbiUrl, localUrl;
      
      if (ncbiMatch) {
        ncbiUrl = ncbiMatch[1];
        // Decode HTML entities like &amp; -> &
        ncbiUrl = ncbiUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        
        // Handle relative URLs
        if (ncbiUrl.startsWith('/')) {
          ncbiUrl = `https://mycomap.com${ncbiUrl}`;
        } else if (!ncbiUrl.startsWith('http')) {
          const baseUrl = blastUrl.replace(/\/$/, '');
          ncbiUrl = `${baseUrl}/${ncbiUrl}`;
        }
        console.log(`[BLAST] Decoded NCBI URL: ${ncbiUrl}`);
      }

      if (localMatch) {
        localUrl = localMatch[1];
        // Decode HTML entities like &amp; -> &
        localUrl = localUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        
        // Handle relative URLs
        if (localUrl.startsWith('/')) {
          localUrl = `https://mycomap.com${localUrl}`;
        } else if (!localUrl.startsWith('http')) {
          const baseUrl = blastUrl.replace(/\/$/, '');
          localUrl = `${baseUrl}/${localUrl}`;
        }
        console.log(`[BLAST] Decoded Local URL: ${localUrl}`);
      }

      console.log(`[BLAST] Found files - NCBI: ${ncbiUrl}, Local: ${localUrl}`);
      return { ncbiUrl, localUrl };
    } catch (error) {
      console.error(`[BLAST] Failed to parse page ${blastUrl}:`, error);
      return {};
    }
  }

  /**
   * Download a file from URL and save it locally
   */
  private async downloadFile(url: string, localPath: string): Promise<boolean> {
    try {
      console.log(`[BLAST] Downloading ${url} to ${localPath}`);
      
      // Add headers to mimic browser request
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      console.log(`[BLAST] Response status: ${response.status} ${response.statusText}`);
      console.log(`[BLAST] Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[BLAST] Error response body:`, errorText.substring(0, 500));
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      console.log(`[BLAST] Downloaded ${buffer.length} bytes`);
      
      // Check if it's actually an XML file by looking at content
      const content = buffer.toString('utf-8', 0, Math.min(200, buffer.length));
      console.log(`[BLAST] File content preview:`, content.substring(0, 200));
      
      if (!content.includes('<?xml') && !content.includes('<BlastOutput')) {
        console.warn(`[BLAST] Downloaded content doesn't appear to be XML`);
      }
      
      await fs.writeFile(localPath, buffer);
      
      console.log(`[BLAST] Successfully downloaded ${localPath}`);
      return true;
    } catch (error) {
      console.error(`[BLAST] Failed to download ${url}:`, error);
      return false;
    }
  }

  /**
   * Extract iNaturalist ID from observation ID
   */
  private extractInatId(observationId: string): string | null {
    // Handle both formats: "271525867" and "iNaturalist-271525867"
    if (observationId.startsWith('iNaturalist-')) {
      return observationId.replace('iNaturalist-', '');
    }
    // Check if it's already a pure number
    if (/^\d+$/.test(observationId)) {
      return observationId;
    }
    return null;
  }

  /**
   * Download BLAST files for a given MycoMap URL and observation ID
   */
  async downloadBlastFiles(observationId: string, blastUrl: string): Promise<BlastDownloadResult> {
    try {
      const inatId = this.extractInatId(observationId);
      if (!inatId) {
        return { success: false, error: 'Invalid observation ID format' };
      }

      // Parse the BLAST page to get file URLs
      const { ncbiUrl, localUrl } = await this.parseBlastPageForFiles(blastUrl);

      if (!ncbiUrl && !localUrl) {
        return { success: false, error: 'No BLAST result files found on the page' };
      }

      // Generate local file paths
      const ncbiPath = ncbiUrl ? path.join(this.downloadDir, `iNat${inatId}-NCBI-BLAST.xml`) : undefined;
      const localPath = localUrl ? path.join(this.downloadDir, `iNat${inatId}-Local-BLAST.xml`) : undefined;

      // Download files
      let ncbiSuccess = true;
      let localSuccess = true;

      if (ncbiUrl && ncbiPath) {
        ncbiSuccess = await this.downloadFile(ncbiUrl, ncbiPath);
      }

      if (localUrl && localPath) {
        localSuccess = await this.downloadFile(localUrl, localPath);
      }

      const success = ncbiSuccess && localSuccess;
      
      return {
        success,
        ncbiPath: ncbiSuccess ? ncbiPath : undefined,
        localPath: localSuccess ? localPath : undefined,
        error: success ? undefined : 'Failed to download some BLAST files'
      };

    } catch (error) {
      console.error(`[BLAST] Download failed for ${observationId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown download error' 
      };
    }
  }

  /**
   * Download trace FASTQ files for a given MycoMap URL and observation ID
   */
  async downloadTraceFiles(observationId: string, traceUrl: string): Promise<TraceDownloadResult> {
    try {
      const inatId = this.extractInatId(observationId);
      if (!inatId) {
        return { success: false, error: 'Invalid observation ID format' };
      }

      // Parse the trace page to get FASTQ file URL
      const { fastqUrl } = await this.parseTracePageForFiles(traceUrl);

      if (!fastqUrl) {
        return { success: false, error: 'No FASTQ trace file found on the page' };
      }

      // Generate local file path
      const fastqPath = path.join(this.traceDir, `iNat${inatId}.fastq`);

      // Download the FASTQ file
      const fastqSuccess = await this.downloadFile(fastqUrl, fastqPath);

      if (!fastqSuccess) {
        return { success: false, error: 'Failed to download FASTQ file' };
      }

      console.log(`[TRACE] Successfully downloaded all files for observation ${observationId}`);
      return {
        success: true,
        fastqPath
      };
    } catch (error) {
      console.error(`[TRACE] Download failed for ${observationId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown download error' 
      };
    }
  }

  /**
   * Check if BLAST files already exist for an observation
   */
  async checkExistingFiles(observationId: string): Promise<{ ncbiExists: boolean; localExists: boolean }> {
    const inatId = this.extractInatId(observationId);
    if (!inatId) {
      return { ncbiExists: false, localExists: false };
    }

    const ncbiPath = path.join(this.downloadDir, `iNat${inatId}-NCBI-BLAST.xml`);
    const localPath = path.join(this.downloadDir, `iNat${inatId}-Local-BLAST.xml`);

    try {
      const [ncbiExists, localExists] = await Promise.all([
        fs.access(ncbiPath).then(() => true).catch(() => false),
        fs.access(localPath).then(() => true).catch(() => false)
      ]);

      return { ncbiExists, localExists };
    } catch {
      return { ncbiExists: false, localExists: false };
    }
  }

  /**
   * Check if trace FASTQ file already exists for an observation
   */
  async checkExistingTraceFiles(observationId: string): Promise<{ fastqExists: boolean }> {
    const inatId = this.extractInatId(observationId);
    if (!inatId) {
      return { fastqExists: false };
    }

    const fastqPath = path.join(this.traceDir, `iNat${inatId}.fastq`);

    try {
      const fastqExists = await fs.access(fastqPath).then(() => true).catch(() => false);
      return { fastqExists };
    } catch {
      return { fastqExists: false };
    }
  }

  /**
   * Save iNaturalist API response as text file
   */
  async saveInatApiResponse(observationId: string, apiResponse: any): Promise<InatApiSaveResult> {
    try {
      const inatId = this.extractInatId(observationId);
      if (!inatId) {
        return { success: false, error: 'Invalid observation ID format' };
      }

      // Create filename with current date
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `iNat${inatId}.${currentDate}.txt`;
      const filePath = path.join(this.inatApiDir, filename);

      // Convert API response to formatted JSON string
      const apiText = JSON.stringify(apiResponse, null, 2);

      // Save to file
      await fs.writeFile(filePath, apiText, 'utf8');

      console.log(`[iNat API] Saved API response for observation ${observationId} to ${filename}`);
      return {
        success: true,
        apiFilePath: filename
      };
    } catch (error) {
      console.error(`[iNat API] Failed to save API response for ${observationId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown save error' 
      };
    }
  }

  /**
   * Check if iNaturalist API file already exists for an observation
   */
  async checkExistingInatApiFiles(observationId: string): Promise<{ apiFileExists: boolean; apiFileName?: string }> {
    const inatId = this.extractInatId(observationId);
    if (!inatId) {
      return { apiFileExists: false };
    }

    try {
      // Check if any API file exists for this observation (could be different dates)
      const files = await fs.readdir(this.inatApiDir);
      const apiFile = files.find(file => file.startsWith(`iNat${inatId}.`) && file.endsWith('.txt'));
      
      if (apiFile) {
        return { apiFileExists: true, apiFileName: apiFile };
      }
      
      return { apiFileExists: false };
    } catch {
      return { apiFileExists: false };
    }
  }
}

export const blastDownloader = new BlastFileDownloader();