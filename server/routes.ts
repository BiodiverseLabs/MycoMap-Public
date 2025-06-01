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
          obs.collector === contributor
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

  app.get("/api/genus-distribution", async (req, res) => {
    try {
      const distribution = await storage.getGenusDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching genus distribution:", error);
      res.status(500).json({ error: "Failed to fetch genus distribution" });
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
        .sort((a, b) => b.globalFirstCount - a.globalFirstCount);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching states with global firsts:", error);
      res.status(500).json({ error: "Failed to fetch states with global firsts" });
    }
  });

  app.get("/api/contributors/global-firsts", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10000;
      
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

  app.get("/api/contributors/state-firsts", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10000;
      
      // Get state first records from record index
      const records = await storage.getRecordIndex(50000, 0, true, false, undefined, false);
      const stateFirsts = records.filter(record => record.isFirstInState);
      
      // Filter by state if specified
      const filteredRecords = state 
        ? stateFirsts.filter(record => record.state === state)
        : stateFirsts;
      
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
          stateFirstCount: count,
          percentage: total > 0 ? (count / total) * 100 : 0
        }))
        .sort((a, b) => b.stateFirstCount - a.stateFirstCount)
        .slice(0, limitNum);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching contributors with state firsts:", error);
      res.status(500).json({ error: "Failed to fetch contributors with state firsts" });
    }
  });

  // Species seasonal distribution endpoint
  app.get("/api/species/:name/seasonal", async (req, res) => {
    try {
      const speciesName = decodeURIComponent(req.params.name);
      const observations = await storage.getAllObservations();
      

      
      // Filter observations for the specific species
      // Use the same logic as the observations endpoint
      const speciesObservations = observations.filter(obs => {
        if (!obs.observedOn) return false;
        return obs.species === speciesName || obs.scientificName === speciesName;
      });
      
      // Initialize month counts
      const monthCounts = Array.from({ length: 12 }, (_, i) => ({
        month: new Date(0, i).toLocaleString('default', { month: 'short' }),
        monthNumber: i + 1,
        count: 0
      }));
      
      // Count observations by month
      speciesObservations.forEach(obs => {
        if (obs.observedOn) {
          const month = new Date(obs.observedOn).getMonth();
          monthCounts[month].count++;
        }
      });
      
      res.json(monthCounts);
    } catch (error) {
      console.error("Error fetching species seasonal distribution:", error);
      res.status(500).json({ error: "Failed to fetch species seasonal distribution" });
    }
  });

  // Contributors species endpoint
  app.get("/api/contributors/species", async (req, res) => {
    try {
      const { state, limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10000;
      
      // Get all observations to access collector and species data
      const observations = await storage.getAllObservations();
      
      // Filter by state if specified
      const filteredObs = state 
        ? observations.filter(obs => obs.state === state)
        : observations;
      
      // Group by collector and count unique species
      const contributorSpecies = filteredObs.reduce((acc, obs) => {
        if (!obs.collector || !obs.scientificName) return acc;
        
        if (!acc[obs.collector]) {
          acc[obs.collector] = new Set();
        }
        acc[obs.collector].add(obs.scientificName);
        return acc;
      }, {} as Record<string, Set<string>>);
      
      const data = Object.entries(contributorSpecies)
        .map(([name, speciesSet]) => ({
          id: name.replace(/\s+/g, '_').toLowerCase(),
          name: name,
          affiliation: undefined,
          speciesCount: speciesSet.size
        }))
        .sort((a, b) => b.speciesCount - a.speciesCount)
        .slice(0, limitNum);
      
      res.json(data);
    } catch (error) {
      console.error("Error fetching contributors species:", error);
      res.status(500).json({ error: "Failed to fetch contributors species" });
    }
  });

  // Update flags endpoints
  app.get("/api/observations/name-updates", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithNameUpdates();
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations with name updates:", error);
      res.status(500).json({ error: "Failed to fetch observations with name updates" });
    }
  });

  app.get("/api/observations/classification-updates", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithClassificationUpdates();
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations with classification updates:", error);
      res.status(500).json({ error: "Failed to fetch observations with classification updates" });
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

  app.post("/api/reprocess-validation-flags", async (req, res) => {
    try {
      // Create a temporary upload record for the existing file
      const upload = await storage.createUpload({
        filename: 'validated_observations.xlsx',
        originalName: 'Validated Observations05.30.25.xlsx',
        recordCount: 0,
        status: 'processing'
      });

      const filePath = path.join(__dirname, '../uploads/validated_observations.xlsx');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Excel file not found. Please upload the file first." });
      }

      // Process with new validation flags
      processExcelFile(upload.id, filePath, upload.originalName)
        .then(() => {
          console.log("Reprocessing with validation flags completed successfully");
        })
        .catch(error => {
          console.error("Error reprocessing file:", error);
          storage.updateUploadStatus(upload.id, 'failed', error.message);
        });

      res.json({ 
        message: "Reprocessing started with validation flags",
        uploadId: upload.id 
      });
    } catch (error) {
      console.error("Error starting reprocessing:", error);
      res.status(500).json({ error: "Failed to start reprocessing" });
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
      await storage.clearAllData();

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

  async function updateContributorStatistics() {
    console.log('Rebuilding contributor statistics...');
    // Get all unique contributors from observations
    const contributorStats = await storage.getTopContributors(10000);
    console.log(`Found ${contributorStats.length} unique contributors to update`);
    
    for (const contributor of contributorStats) {
      await storage.upsertContributor({
        name: contributor.name,
        affiliation: contributor.affiliation || null,
        observationCount: contributor.observationCount
      });
    }
    console.log('Contributor statistics updated');
  }

  async function updateSpeciesStatistics() {
    console.log('Rebuilding species statistics...');
    // Get all unique species from observations
    const speciesStats = await storage.getTopSpecies(50000);
    console.log(`Found ${speciesStats.length} unique species to update`);
    
    for (const species of speciesStats) {
      await storage.upsertSpecies({
        scientificName: species.scientificName,
        commonName: species.commonName,
        phylum: species.phylum,
        class: species.class,
        order: species.order,
        family: species.family,
        observationCount: species.observationCount
      });
    }
    console.log('Species statistics updated');
  }

  async function processExcelFile(uploadId: number, filePath: string, originalName: string) {
    try {
      console.log('=== STARTING EXCEL PROCESSING ===');
      console.log('Upload ID:', uploadId);
      console.log('File path:', filePath);
      console.log('Original name:', originalName);
      console.log('File exists:', fs.existsSync(filePath));
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }
      
      // Clear existing data to avoid duplicates
      console.log('Clearing existing data...');
      await storage.clearAllData();
      console.log('✓ Data cleared');
      
      // Dynamically import XLSX with proper CommonJS handling
      console.log('Importing XLSX library...');
      const XLSX = await import('xlsx');
      const { readFile, utils } = XLSX.default;
      console.log('✓ XLSX library imported');
      
      // Read Excel file with streaming to handle large files
      console.log('Reading Excel file...');
      const workbook = readFile(filePath, { cellDates: true });
      console.log('✓ Workbook loaded, sheet names:', workbook.SheetNames);
      const sheetName = workbook.SheetNames.find((name: string) => 
        name.toLowerCase().includes('validated') || 
        name.toLowerCase().includes('observation')
      ) || workbook.SheetNames[0];
      
      const worksheet = workbook.Sheets[sheetName];
      console.log('Converting sheet to JSON (this may take a moment for large files)...');
      const rawData = utils.sheet_to_json(worksheet);

      console.log('✓ Raw data length:', rawData.length);
      if (rawData.length > 0) {
        const allColumns = Object.keys(rawData[0] as any);
        console.log('Available columns:', allColumns);
        
        // Currently mapped fields - ALL 47 FIELDS NOW MAPPED
        const mapped = [
          'Source Database', 'Reference Number', 'Collection Number', 'Report Date', 'Creation Date',
          'Collector', 'Verified', 'Kingdom', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species',
          'Variety', 'Authority', 'Abbreviated Authority', 'Mycobank #', 'Fungarium Specimen', 'Images',
          'GenBank Accession #', 'MyCoPortal #', 'DNA Sequence', 'Sequence', 'Flags', 'Forward Primer',
          'Reverse Primer', 'Sequence Owner', 'Run Name', 'Sequence #2', 'Forward Primer #2',
          'Reverse Primer #2', 'Sequence Owner #2', 'Run Name #2', 'Location Name', 'Country', 'City',
          'State', 'Latitude', 'Longitude', 'Notes', 'MO Notes', 'Report Link', 'Image Link',
          'First State Record', 'First GenBank Record', 'Multiple Genotypes Under Name'
        ];
        
        const unmapped = allColumns.filter(col => !mapped.includes(col));
        console.log('UNMAPPED FIELDS:', unmapped);
        console.log(`Total: ${allColumns.length}, Mapped: ${mapped.filter(f => allColumns.includes(f)).length}, Unmapped: ${unmapped.length}`);
      }

      // Transform and validate data using actual column names from your file
      const observations = rawData.map((row: any) => {
        // Construct scientific name following taxonomic hierarchy
        // Priority: Variety -> Species -> Genus -> Family -> Order -> Class -> Phylum -> Kingdom
        let scientificName = '';
        if (row['Variety']) {
          scientificName = row['Variety'];
        } else if (row['Species']) {
          scientificName = row['Species'];
        } else if (row['Genus']) {
          scientificName = row['Genus'];
        } else if (row['Family']) {
          scientificName = row['Family'];
        } else if (row['Order']) {
          scientificName = row['Order'];
        } else if (row['Class']) {
          scientificName = row['Class'];
        } else if (row['Phylum']) {
          scientificName = row['Phylum'];
        } else if (row['Kingdom']) {
          scientificName = row['Kingdom'];
        } else {
          scientificName = 'Unknown';
        }
        
        // Check for name_update flag: Species or Variety is missing
        const nameUpdate = !row['Species'] && !row['Variety'];
        
        // Check for classification_update flag: has species/variety but missing higher taxonomy
        const hasSpeciesOrVariety = row['Species'] || row['Variety'];
        const missingHigherTaxonomy = hasSpeciesOrVariety && (
          !row['Kingdom'] || !row['Phylum'] || !row['Class'] || 
          !row['Order'] || !row['Family'] || !row['Genus']
        );
        const classificationUpdate = missingHigherTaxonomy;

        return {
          observationId: row['Reference Number'] || `${Date.now()}-${Math.random()}`,
          scientificName: scientificName,
          commonName: null, // Not present in your data
          phylum: row['Phylum'] || null,
          class: row['Class'] || null,
          order: row['Order'] || null,
          family: row['Family'] || null,
          genus: row['Genus'] || null,
          species: row['Species'] || null,
          infraspecies: row['Variety'] || null,
          observer: row['Sequence Owner'] || null,
          collector: row['Collector'] || null,
          observedOn: (() => {
            try {
              if (!row['Report Date']) return null;
              const dateValue = row['Report Date'];
              if (typeof dateValue === 'number') {
                // Excel serial date
                const date = new Date((dateValue - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              } else if (dateValue instanceof Date) {
                return isNaN(dateValue.getTime()) ? null : dateValue.toISOString().split('T')[0];
              } else if (typeof dateValue === 'string') {
                const date = new Date(dateValue);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              }
              return null;
            } catch (e) {
              return null;
            }
          })(),
          latitude: row['Latitude'] ? String(row['Latitude']) : null,
          longitude: row['Longitude'] ? String(row['Longitude']) : null,
          placeGuess: row['City'] || null,
          state: row['State'] || null,
          country: row['Country'] || null,
          genbankAccession: row['GenBank Accession #'] || null,
          mycoportalNumber: row['MyCoPortal #'] || null,
          dnaSequence: row['DNA Sequence'] || null,
          sequence: row['Sequence'] || null,
          
          // Additional mapped fields
          collectionNumber: row['Collection Number'] || null,
          creationDate: (() => {
            try {
              if (!row['Creation Date']) return null;
              const dateValue = row['Creation Date'];
              if (typeof dateValue === 'number') {
                // Excel serial date
                const date = new Date((dateValue - 25569) * 86400 * 1000);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              } else if (dateValue instanceof Date) {
                return isNaN(dateValue.getTime()) ? null : dateValue.toISOString().split('T')[0];
              } else if (typeof dateValue === 'string') {
                const date = new Date(dateValue);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
              }
              return null;
            } catch (e) {
              return null;
            }
          })(),
          verified: row['Verified'] || null,
          kingdom: row['Kingdom'] || null,
          authority: row['Authority'] || null,
          abbreviatedAuthority: row['Abbreviated Authority'] || null,
          mycobankNumber: row['Mycobank #'] || null,
          fungariumSpecimen: row['Fungarium Specimen'] || null,
          images: row['Images'] || null,
          flags: row['Flags'] || null,
          forwardPrimer: row['Forward Primer'] || null,
          reversePrimer: row['Reverse Primer'] || null,
          runName: row['Run Name'] || null,
          sequence2: row['Sequence #2'] || null,
          forwardPrimer2: row['Forward Primer #2'] || null,
          reversePrimer2: row['Reverse Primer #2'] || null,
          sequenceOwner2: row['Sequence Owner #2'] || null,
          runName2: row['Run Name #2'] || null,
          locationName: row['Location Name'] || null,
          notes: row['Notes'] || null,
          moNotes: row['MO Notes'] || null,
          reportLink: row['Report Link'] || null,
          imageLink: row['Image Link'] || null,
          firstGenbankRecord: row['First GenBank Record'] === 'yes',
          
          isFirstStateRecord: row['First State Record'] === 'yes',
          hasMultipleGenotypes: row['Multiple Genotypes Under Name'] === 'yes',
          source: row['Source Database'] || row['Source'] || row['source'] || 'Unknown',
          sourceUrl: row['Source URL'] || row['source_url'] || null,
          nameUpdate: nameUpdate,
          classificationUpdate: classificationUpdate,
        };
      }).filter(obs => obs.scientificName); // Filter out rows without scientific name

      // Count validation flags
      let nameUpdateCount = 0;
      let classificationUpdateCount = 0;
      
      observations.forEach(obs => {
        if (obs.nameUpdate) nameUpdateCount++;
        if (obs.classificationUpdate) classificationUpdateCount++;
      });

      console.log(`Processed ${observations.length} valid observations`);
      console.log(`Validation flags: ${nameUpdateCount} name updates, ${classificationUpdateCount} classification updates`);

      // Insert observations in batches (increased batch size for better performance)
      const batchSize = 1000;
      let insertedCount = 0;
      
      console.log(`Starting batch insert...`);
      
      for (let i = 0; i < observations.length; i += batchSize) {
        const batch = observations.slice(i, i + batchSize);
        console.log(`Inserting batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(observations.length/batchSize)} (records ${i + 1}-${Math.min(i + batchSize, observations.length)})`);
        
        try {
          await storage.createObservations(batch);
          insertedCount += batch.length;
          console.log(`✓ Batch inserted successfully. Total inserted: ${insertedCount}`);
        } catch (batchError) {
          console.error(`✗ Error inserting batch ${Math.floor(i/batchSize) + 1}:`, batchError);
          throw batchError;
        }
        
        if (insertedCount % 5000 === 0) {
          console.log(`Progress milestone: ${insertedCount} observations inserted...`);
        }
      }
      
      console.log(`Successfully inserted ${insertedCount} observations total`);

      // Update all index tables and statistics
      console.log('Updating contributor statistics...');
      await updateContributorStatistics();
      
      console.log('Updating species statistics...');
      await updateSpeciesStatistics();
      
      console.log('Building GPS index for map performance...');
      await storage.buildGpsIndex();
      
      console.log('All index tables updated successfully');

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



  // Serve original Excel file for download
  app.get("/api/export/original", (req, res) => {
    try {
      const filePath = path.join(__dirname, '../attached_assets/Validated Observations05.30.25.xlsx');
      const fileName = 'Validated_Observations_05.30.25.xlsx';
      
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      res.sendFile(path.resolve(filePath), (err) => {
        if (err) {
          console.error('Error sending file:', err);
          res.status(404).json({ error: 'Original dataset file not found' });
        }
      });
    } catch (error) {
      console.error('Error serving original Excel file:', error);
      res.status(500).json({ error: 'Failed to serve original dataset file' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
