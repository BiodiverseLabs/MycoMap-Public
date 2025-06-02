import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';

export interface BlastDownloadResult {
  success: boolean;
  ncbiPath?: string;
  localPath?: string;
  error?: string;
}

export class BlastFileDownloader {
  private downloadDir = path.join(process.cwd(), 'downloads', 'blast');

  constructor() {
    this.ensureDownloadDir();
  }

  private async ensureDownloadDir() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create download directory:', error);
    }
  }

  /**
   * Parse MycoMap BLAST URL to extract file URLs
   * Example URL: https://mycomap.com/genetics/blast-search/hfsont33_its4-5_95-dik-s-pl04-mgk04-ns4918-inat265571056-basidio-1-ric499-358689-r284591/
   */
  private async parseBlastPageForFiles(blastUrl: string): Promise<{ ncbiUrl?: string; localUrl?: string }> {
    try {
      console.log(`[BLAST] Fetching page: ${blastUrl}`);
      const response = await fetch(blastUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log(`[BLAST] Page content length: ${html.length} characters`);
      
      // Look for various patterns to find file links
      console.log(`[BLAST] Searching for NCBI and Local result links...`);
      
      // Try multiple regex patterns to catch different HTML structures
      const patterns = [
        // Pattern 1: Standard link with "NCBI Results:" text
        /NCBI Results:\s*<a[^>]*href="([^"]*(?:\.xml|file\.php[^"]*xml[^"]*))"[^>]*>([^<]*(?:\.xml|[^<]*))<\/a>/i,
        // Pattern 2: Link containing "NCBI" in href
        /<a[^>]*href="([^"]*(?:NCBI|ncbi)[^"]*(?:\.xml|file\.php[^"]*))"[^>]*>([^<]*(?:\.xml|[^<]*))<\/a>/i,
        // Pattern 3: Any link with .xml file
        /<a[^>]*href="([^"]*\.xml)"[^>]*>([^<]*\.xml)<\/a>/i
      ];
      
      const localPatterns = [
        /Local Results:\s*<a[^>]*href="([^"]*(?:\.xml|file\.php[^"]*xml[^"]*))"[^>]*>([^<]*(?:\.xml|[^<]*))<\/a>/i,
        /<a[^>]*href="([^"]*(?:local|Local)[^"]*(?:\.xml|file\.php[^"]*))"[^>]*>([^<]*(?:\.xml|[^<]*))<\/a>/i
      ];

      let ncbiUrl, localUrl;
      
      // Try each pattern for NCBI
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          ncbiUrl = match[1];
          console.log(`[BLAST] Found NCBI match with pattern: ${pattern.source.substring(0, 50)}...`);
          console.log(`[BLAST] Raw NCBI URL: ${ncbiUrl}`);
          break;
        }
      }
      
      // Try each pattern for Local
      for (const pattern of localPatterns) {
        const match = html.match(pattern);
        if (match) {
          localUrl = match[1];
          console.log(`[BLAST] Found Local match with pattern: ${pattern.source.substring(0, 50)}...`);
          console.log(`[BLAST] Raw Local URL: ${localUrl}`);
          break;
        }
      }
      
      // If no matches found, let's see what links are available
      if (!ncbiUrl && !localUrl) {
        console.log(`[BLAST] No file links found. Searching for all links...`);
        const allLinks = html.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi);
        if (allLinks) {
          console.log(`[BLAST] Found ${allLinks.length} total links:`);
          allLinks.slice(0, 10).forEach((link, i) => {
            console.log(`[BLAST] Link ${i + 1}: ${link.substring(0, 100)}`);
          });
        }
        
        // Look for any mention of XML files or file download links
        const xmlMentions = html.match(/[^<>]*(?:\.xml|file\.php)[^<>]*/gi);
        if (xmlMentions) {
          console.log(`[BLAST] Found ${xmlMentions.length} XML mentions:`);
          xmlMentions.slice(0, 5).forEach((mention, i) => {
            console.log(`[BLAST] XML mention ${i + 1}: ${mention.substring(0, 200)}`);
          });
        }
      }
      
      // Clean up URLs and handle HTML entities
      if (ncbiUrl) {
        ncbiUrl = ncbiUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        if (ncbiUrl.startsWith('/')) {
          ncbiUrl = `https://mycomap.com${ncbiUrl}`;
        } else if (!ncbiUrl.startsWith('http')) {
          const baseUrl = blastUrl.replace(/\/$/, '');
          ncbiUrl = `${baseUrl}/${ncbiUrl}`;
        }
      }

      if (localUrl) {
        localUrl = localUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        if (localUrl.startsWith('/')) {
          localUrl = `https://mycomap.com${localUrl}`;
        } else if (!localUrl.startsWith('http')) {
          const baseUrl = blastUrl.replace(/\/$/, '');
          localUrl = `${baseUrl}/${localUrl}`;
        }
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

      console.log(`[BLAST] Starting download process for observation ${observationId} (iNat${inatId})`);

      // Parse the BLAST page to get file URLs
      const { ncbiUrl, localUrl } = await this.parseBlastPageForFiles(blastUrl);

      if (!ncbiUrl && !localUrl) {
        return { success: false, error: 'No BLAST result files found on the page. The MycoMap page may not contain downloadable XML files or they may require authentication.' };
      }

      // Generate local file paths
      const ncbiPath = ncbiUrl ? path.join(this.downloadDir, `iNat${inatId}-NCBI-BLAST.xml`) : undefined;
      const localPath = localUrl ? path.join(this.downloadDir, `iNat${inatId}-Local-BLAST.xml`) : undefined;

      console.log(`[BLAST] Attempting to download:${ncbiUrl ? `\n  NCBI: ${ncbiUrl} -> ${ncbiPath}` : ''}${localUrl ? `\n  Local: ${localUrl} -> ${localPath}` : ''}`);

      // Download files
      let ncbiSuccess = true;
      let localSuccess = true;
      let downloadErrors: string[] = [];

      if (ncbiUrl && ncbiPath) {
        console.log(`[BLAST] Downloading NCBI file...`);
        ncbiSuccess = await this.downloadFile(ncbiUrl, ncbiPath);
        if (!ncbiSuccess) {
          downloadErrors.push('NCBI file download failed');
        }
      }

      if (localUrl && localPath) {
        console.log(`[BLAST] Downloading Local file...`);
        localSuccess = await this.downloadFile(localUrl, localPath);
        if (!localSuccess) {
          downloadErrors.push('Local file download failed');
        }
      }

      const success = ncbiSuccess && localSuccess;
      
      let errorMessage = undefined;
      if (!success) {
        if (downloadErrors.length > 0) {
          errorMessage = `${downloadErrors.join(', ')}. This may be due to MycoMap's authentication system or session-based file access. The links found were: ${[ncbiUrl, localUrl].filter(Boolean).join(', ')}`;
        } else {
          errorMessage = 'Failed to download some BLAST files';
        }
      }
      
      console.log(`[BLAST] Download summary - NCBI: ${ncbiSuccess ? 'SUCCESS' : 'FAILED'}, Local: ${localSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      return {
        success,
        ncbiPath: ncbiSuccess ? ncbiPath : undefined,
        localPath: localSuccess ? localPath : undefined,
        error: errorMessage
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
}

export const blastDownloader = new BlastFileDownloader();