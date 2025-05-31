import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertObservationSchema, insertUploadSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
// XLSX will be imported dynamically
import path from "path";
import fs from "fs";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Analytics endpoints
  app.get("/api/observations", async (req, res) => {
    try {
      const { startDate, endDate, state, contributor, species, dateRange, limit } = req.query;
      
      console.log(`[API] GET /api/observations - dateRange: "${dateRange}", limit: "${limit}", contributor: "${contributor}", state: "${state}"`);
      
      // Convert dateRange to actual dates (same logic as metrics endpoint)
      let actualStartDate = startDate as string;
      let actualEndDate = endDate as string;
      
      if (dateRange === 'last_30_days') {
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'all_time') {
        // Don't set date filters for all time
        actualStartDate = undefined as any;
        actualEndDate = undefined as any;
      }
      
      let observations;
      if (actualStartDate && actualEndDate) {
        observations = await storage.getObservationsByDateRange(
          actualStartDate, 
          actualEndDate
        );
      } else if (state) {
        observations = await storage.getObservationsByState(state as string);
      } else {
        observations = await storage.getAllObservations();
      }
      
      // Filter by contributor if specified
      if (contributor) {
        observations = observations.filter(obs => 
          obs.observer === contributor || obs.collector === contributor
        );
      }
      
      // Filter by species if specified
      if (species) {
        observations = observations.filter(obs => 
          obs.species === species || obs.scientificName === species
        );
      }
      
      // Apply limit if specified (important for production performance)
      if (limit) {
        const limitNum = parseInt(limit as string, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          observations = observations.slice(0, limitNum);
        }
      }
      
      console.log(`[API] Returning ${observations.length} observations`);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations:", error);
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });

  app.get("/api/observations/summary", async (req, res) => {
    try {
      const { dateRange, aggregate } = req.query;
      
      console.log(`[API] GET /api/observations/summary - dateRange: "${dateRange}", aggregate: "${aggregate}"`);
      
      // Convert dateRange to actual dates (same logic as other endpoints)
      let actualStartDate: string | undefined;
      let actualEndDate: string | undefined;
      
      if (dateRange === 'last_30_days') {
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      }
      
      let observations;
      if (actualStartDate && actualEndDate) {
        observations = await storage.getObservationsByDateRange(actualStartDate, actualEndDate);
      } else {
        observations = await storage.getAllObservations();
      }
      
      if (aggregate === 'states') {
        // Group observations by state and count them
        const stateCounts = observations.reduce((acc: { [key: string]: number }, obs) => {
          if (obs.state) {
            acc[obs.state] = (acc[obs.state] || 0) + 1;
          }
          return acc;
        }, {});
        
        // Convert to array format sorted by count
        const stateArray = Object.entries(stateCounts)
          .map(([state, count]) => ({ state, count }))
          .sort((a, b) => b.count - a.count);
        
        res.json(stateArray);
      } else {
        res.json([]);
      }
    } catch (error) {
      console.error("Error fetching observation summary:", error);
      res.status(500).json({ error: "Failed to fetch observation summary" });
    }
  });

  app.get("/api/metrics", async (req, res) => {
    try {
      const { startDate, endDate, dateRange } = req.query;
      
      console.log(`[API] GET /api/metrics - dateRange: "${dateRange}", startDate: "${startDate}", endDate: "${endDate}"`);
      
      // Convert dateRange to actual dates
      let actualStartDate: string | undefined;
      let actualEndDate: string | undefined;
      
      if (dateRange === 'last_30_days') {
        // Recent observations from 2025
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        // Last 6 months of data
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        // All 2024-2025 data
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'all_time') {
        // Don't set date filters for all time
        actualStartDate = undefined;
        actualEndDate = undefined;
      } else if (startDate && endDate) {
        actualStartDate = startDate as string;
        actualEndDate = endDate as string;
      }
      
      console.log(`[API] Calculated dates - actualStartDate: "${actualStartDate}", actualEndDate: "${actualEndDate}"`);
      
      const metrics = await storage.getObservationMetrics(actualStartDate, actualEndDate);
      console.log(`[API] Metrics result:`, metrics);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/temporal-trends", async (req, res) => {
    try {
      const { groupBy = 'month' } = req.query;
      const trends = await storage.getTemporalTrends(groupBy as 'month' | 'quarter' | 'year');
      res.json(trends);
    } catch (error) {
      console.error("Error fetching temporal trends:", error);
      res.status(500).json({ error: "Failed to fetch temporal trends" });
    }
  });

  app.get("/api/seasonal-patterns", async (req, res) => {
    try {
      const patterns = await storage.getSeasonalPatterns();
      res.json(patterns);
    } catch (error) {
      console.error("Error fetching seasonal patterns:", error);
      res.status(500).json({ error: "Failed to fetch seasonal patterns" });
    }
  });

  app.get("/api/monthly-statistics", async (req, res) => {
    try {
      const stats = await storage.getMonthlyStatistics();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching monthly statistics:", error);
      res.status(500).json({ error: "Failed to fetch monthly statistics" });
    }
  });

  // Optimized map data endpoint using GPS index
  app.get("/api/map-data", async (req, res) => {
    try {
      const { limit = "75000", state } = req.query;
      console.log(`[API] GET /api/map-data - limit: "${limit}", state: "${state}"`);

      const limitNum = Math.min(parseInt(limit as string) || 75000, 75000);
      const mapData = await storage.getMapDataOptimized(limitNum, state as string);

      console.log(`[API] Returning ${mapData.length} map coordinates`);
      res.json(mapData);
    } catch (error) {
      console.error("Error fetching map data:", error);
      res.status(500).json({ error: "Failed to fetch map data" });
    }
  });

  // Build GPS index endpoint for optimization
  app.post("/api/build-gps-index", async (req, res) => {
    try {
      console.log('[API] Building GPS index...');
      await storage.buildGpsIndex();
      console.log('[API] GPS index built successfully');
      res.json({ success: true, message: "GPS index built successfully" });
    } catch (error) {
      console.error("Error building GPS index:", error);
      res.status(500).json({ error: "Failed to build GPS index" });
    }
  });

  app.get("/api/taxonomic-distribution", async (req, res) => {
    try {
      const distribution = await storage.getTaxonomicDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching taxonomic distribution:", error);
      res.status(500).json({ error: "Failed to fetch taxonomic distribution" });
    }
  });

  app.get("/api/family-distribution", async (req, res) => {
    try {
      const distribution = await storage.getFamilyDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching family distribution:", error);
      res.status(500).json({ error: "Failed to fetch family distribution" });
    }
  });

  app.get("/api/class-distribution", async (req, res) => {
    try {
      const distribution = await storage.getClassDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching class distribution:", error);
      res.status(500).json({ error: "Failed to fetch class distribution" });
    }
  });

  app.get("/api/order-distribution", async (req, res) => {
    try {
      const distribution = await storage.getOrderDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching order distribution:", error);
      res.status(500).json({ error: "Failed to fetch order distribution" });
    }
  });

  app.get("/api/contributors", async (req, res) => {
    try {
      const { limit, dateRange, state } = req.query;
      
      // Convert dateRange to actual dates (same logic as metrics)
      let actualStartDate: string | undefined;
      let actualEndDate: string | undefined;
      
      if (dateRange === 'last_30_days') {
        actualStartDate = '2025-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_6_months') {
        actualStartDate = '2024-10-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'last_year') {
        actualStartDate = '2024-01-01';
        actualEndDate = '2025-04-18';
      } else if (dateRange === 'all_time') {
        actualStartDate = undefined;
        actualEndDate = undefined;
      }
      
      // Use a very high limit if no specific limit is provided to get all contributors
      const contributorLimit = limit ? parseInt(limit as string) : 10000;
      const contributors = await storage.getTopContributors(contributorLimit, actualStartDate, actualEndDate, state as string);
      res.json(contributors);
    } catch (error) {
      console.error("Error fetching contributors:", error);
      res.status(500).json({ error: "Failed to fetch contributors" });
    }
  });

  app.get("/api/species", async (req, res) => {
    try {
      const { limit, type = 'top', state, name } = req.query;
      
      // If searching for a specific species by name
      if (name) {
        const allSpecies = await storage.getTopSpecies(50000);
        const matchedSpecies = allSpecies.filter(s => s.scientificName === name);
        res.json(matchedSpecies);
        return;
      }
      
      // Use a very high limit if no specific limit is provided to get all species
      const speciesLimit = limit ? parseInt(limit as string) : 50000;
      
      let species;
      if (type === 'rare') {
        species = await storage.getRareSpecies(speciesLimit, state as string);
      } else {
        species = await storage.getTopSpecies(speciesLimit, state as string);
      }
      
      res.json(species);
    } catch (error) {
      console.error("Error fetching species:", error);
      res.status(500).json({ error: "Failed to fetch species" });
    }
  });

  app.get("/api/state-records", async (req, res) => {
    try {
      const { limit = '10' } = req.query;
      const records = await storage.getRecentStateRecords(parseInt(limit as string));
      res.json(records);
    } catch (error) {
      console.error("Error fetching state records:", error);
      res.status(500).json({ error: "Failed to fetch state records" });
    }
  });

  app.get("/api/record-index", async (req, res) => {
    try {
      const { 
        limit = '50', 
        offset = '0', 
        stateFirstsOnly = 'false', 
        globalFirstsOnly = 'false', 
        recent = 'false', 
        state,
        startDate,
        endDate,
        species
      } = req.query;
      
      const index = await storage.getRecordIndex(
        parseInt(limit as string), 
        parseInt(offset as string),
        stateFirstsOnly === 'true',
        recent === 'true',
        state as string,
        globalFirstsOnly === 'true',
        startDate as string,
        endDate as string,
        species as string
      );
      
      console.log(`[DEBUG] Record index query - limit: ${limit}, offset: ${offset}, stateFirstsOnly: ${stateFirstsOnly}, state: ${state}, returned: ${index.length} records`);
      
      res.json(index);
    } catch (error) {
      console.error("Error fetching record index:", error);
      res.status(500).json({ error: "Failed to fetch record index" });
    }
  });

  app.get("/api/observation-sources", async (req, res) => {
    try {
      const { dateRange } = req.query;
      const sources = await storage.getObservationSources(dateRange as string);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching observation sources:", error);
      res.status(500).json({ error: "Failed to fetch observation sources" });
    }
  });

  // Get species accumulation curve data
  app.get("/api/species-accumulation", async (req, res) => {
    try {
      const { state } = req.query;
      const data = await storage.getSpeciesAccumulation(state as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching species accumulation data:", error);
      res.status(500).json({ error: "Failed to fetch species accumulation data" });
    }
  });

  // Global first records endpoints
  app.get("/api/states/global-firsts", async (req, res) => {
    try {
      const { state } = req.query;
      
      // Get actual global first records from database
      const records = await storage.getRecordIndex(50000, 0, false, false, undefined, true);
      const globalFirsts = records.filter(record => record.isFirstGlobal);
      
      // Group by state and count
      const stateGroups = globalFirsts.reduce((acc, record) => {
        if (state && record.state !== state) return acc;
        acc[record.state] = (acc[record.state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const total = Object.values(stateGroups).reduce((sum, count) => sum + count, 0);
      
      const data = Object.entries(stateGroups)
        .map(([stateName, count]) => ({
          state: stateName,
          globalFirstCount: count,
          percentage: total > 0 ? (count / total) * 100 : 0
        }))
        .sort((a, b) => b.globalFirstCount - a.globalFirstCount)
        .slice(0, 20);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching states with global firsts:", error);
      res.status(500).json({ error: "Failed to fetch states with global firsts" });
    }
  });

  app.get("/api/contributors/global-firsts", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10;
      
      // Get global first records from record index
      const records = await storage.getRecordIndex(50000, 0, false, false, undefined, true);
      const globalFirsts = records.filter(record => record.isFirstGlobal);
      
      // Filter by state if specified
      const filteredRecords = state 
        ? globalFirsts.filter(record => record.state === state)
        : globalFirsts;
      
      // Get all observations to match observer names
      const observations = await storage.getAllObservations();
      
      // Create a map of observation IDs to collector names
      const collectorMap = new Map<number, string>();
      observations.forEach(obs => {
        if (obs.collector) {
          collectorMap.set(obs.id, obs.collector);
        }
      });
      
      // Group by collector and count
      const contributorGroups = filteredRecords.reduce((acc, record) => {
        const collectorName = collectorMap.get(record.id);
        if (collectorName) {
          acc[collectorName] = (acc[collectorName] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      const total = Object.values(contributorGroups).reduce((sum, count) => sum + count, 0);
      
      const data = Object.entries(contributorGroups)
        .map(([name, count]) => ({
          id: name.replace(/\s+/g, '_').toLowerCase(),
          name: name,
          affiliation: undefined,
          globalFirstCount: count,
          percentage: total > 0 ? (count / total) * 100 : 0
        }))
        .sort((a, b) => b.globalFirstCount - a.globalFirstCount)
        .slice(0, limitNum);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching contributors with global firsts:", error);
      res.status(500).json({ error: "Failed to fetch contributors with global firsts" });
    }
  });

  // Upload endpoints
  app.get("/api/uploads", async (req, res) => {
    try {
      const uploads = await storage.getUploads();
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ error: "Failed to fetch uploads" });
    }
  });

  app.post("/api/reprocess-upload/:id", async (req, res) => {
    try {
      const uploadId = parseInt(req.params.id);
      const uploads = await storage.getUploads();
      const upload = uploads.find(u => u.id === uploadId);
      
      if (!upload) {
        return res.status(404).json({ error: "Upload not found" });
      }

      const filePath = path.join(__dirname, '../uploads', upload.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // Clear existing data first
      await db.execute(sql`DELETE FROM ${observations}`);
      await db.execute(sql`DELETE FROM ${contributors}`);
      await db.execute(sql`DELETE FROM ${species}`);

      // Reprocess with updated field mapping
      processExcelFile(uploadId, filePath, upload.originalName)
        .catch(error => {
          console.error("Error reprocessing file:", error);
          storage.updateUploadStatus(uploadId, 'failed', error.message);
        });

      res.json({ message: "Reprocessing started with updated field mapping" });
    } catch (error) {
      console.error("Error reprocessing upload:", error);
      res.status(500).json({ error: "Failed to reprocess upload" });
    }
  });

  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, filename, path: filePath } = req.file;

      // Create upload record
      const uploadRecord = await storage.createUpload({
        filename,
        originalName: originalname,
        recordCount: 0,
        status: 'processing'
      });

      // Process Excel file asynchronously
      processExcelFile(uploadRecord.id, filePath, originalname)
        .catch(error => {
          console.error("Error processing file:", error);
          storage.updateUploadStatus(uploadRecord.id, 'failed', error.message);
        });

      res.json({ 
        message: "File uploaded successfully and is being processed",
        uploadId: uploadRecord.id 
      });

    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  async function processExcelFile(uploadId: number, filePath: string, originalName: string) {
    try {
      console.log('Processing Excel file:', filePath);
      console.log('File exists:', fs.existsSync(filePath));
      
      // Clear existing data to avoid duplicates
      await storage.clearAllData();
      
      // Dynamically import XLSX with proper CommonJS handling
      const XLSX = await import('xlsx');
      const { readFile, utils } = XLSX.default;
      
      // Read Excel file
      const workbook = readFile(filePath);
      console.log('Workbook loaded, sheet names:', workbook.SheetNames);
      const sheetName = workbook.SheetNames.find((name: string) => 
        name.toLowerCase().includes('validated') || 
        name.toLowerCase().includes('observation')
      ) || workbook.SheetNames[0];
      
      const worksheet = workbook.Sheets[sheetName];
      const rawData = utils.sheet_to_json(worksheet);

      console.log('Raw data length:', rawData.length);
      if (rawData.length > 0) {
        console.log('Available columns:', Object.keys(rawData[0]));
        console.log('Sample row:', rawData[0]);
      }

      // Transform and validate data using actual column names from your file
      const observations = rawData.map((row: any) => {
        return {
          observationId: row['Reference Number'] || `${Date.now()}-${Math.random()}`,
          scientificName: `${row['Genus'] || ''} ${row['Species'] || ''}`.trim(),
          commonName: null, // Not present in your data
          phylum: row['Phylum'] || null,
          class: row['Class'] || null,
          order: row['Order'] || null,
          family: row['Family'] || null,
          genus: row['Genus'] || null,
          species: row['Species'] || null,
          infraspecies: null, // Not present in your data
          observer: row['Sequence Owner'] || null,
          collector: row['Collector'] || null,
          observedOn: row['Report Date'] ? 
            new Date((row['Report Date'] - 25569) * 86400 * 1000).toISOString().split('T')[0] : null,
          latitude: row['Latitude'] ? String(row['Latitude']) : null,
          longitude: row['Longitude'] ? String(row['Longitude']) : null,
          placeGuess: row['City'] || null,
          state: row['State'] || null,
          country: row['Country'] || null,
          genbankAccession: row['GenBank Accession #'] || null,
          isFirstStateRecord: row['First State Record'] === 'yes',
          hasMultipleGenotypes: row['Multiple Genotypes Under Name'] === 'yes',
          source: row['Source Database'] || row['Source'] || row['source'] || 'Unknown',
          sourceUrl: row['Source URL'] || row['source_url'] || null,
        };
      }).filter(obs => obs.scientificName); // Filter out rows without scientific name

      // Insert observations in batches (increased batch size for better performance)
      const batchSize = 1000;
      let insertedCount = 0;
      
      console.log(`Processed ${observations.length} valid observations, starting batch insert...`);
      
      for (let i = 0; i < observations.length; i += batchSize) {
        const batch = observations.slice(i, i + batchSize);
        console.log(`Inserting batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(observations.length/batchSize)}`);
        await storage.createObservations(batch);
        insertedCount += batch.length;
        if (i % 1000 === 0) {
          console.log(`Progress: ${insertedCount} observations inserted...`);
        }
      }
      
      console.log(`Successfully inserted ${insertedCount} observations total`);

      // Update contributor and species statistics
      await updateStatistics();

      // Update upload status
      await storage.updateUploadStatus(uploadId, 'completed');

      // Clean up uploaded file
      fs.unlinkSync(filePath);

    } catch (error) {
      console.error("Error processing Excel file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await storage.updateUploadStatus(uploadId, 'failed', errorMessage);
      
      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error("Error deleting file:", unlinkError);
      }
    }
  }

  async function updateStatistics() {
    // This would update contributor and species statistics
    // Implementation would aggregate data from observations table
    // For now, we'll skip this to keep the example focused
  }

  const httpServer = createServer(app);
  return httpServer;
}
