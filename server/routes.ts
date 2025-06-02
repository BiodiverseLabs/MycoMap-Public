import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertObservationSchema, insertUploadSchema, species } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
// XLSX will be imported dynamically
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { blastDownloader } from "./blastDownloader";

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const uploadMemory = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for CSV files
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

  // Get observations with character encoding issues
  app.get("/api/observations/encoding-issues", async (req, res) => {
    try {
      const observations = await storage.getObservationsWithEncodingIssues();
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations with encoding issues:", error);
      res.status(500).json({ error: "Failed to fetch observations with encoding issues" });
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
      const { startDate, endDate, dateRange, state } = req.query;
      
      console.log(`[API] GET /api/metrics - dateRange: "${dateRange}", startDate: "${startDate}", endDate: "${endDate}", state: "${state}"`);
      
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
      
      const metrics = await storage.getObservationMetrics(actualStartDate, actualEndDate, state as string);
      console.log(`[API] Metrics result:`, metrics);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/temporal-trends", async (req, res) => {
    try {
      const { groupBy = 'month', state } = req.query;
      const trends = await storage.getTemporalTrends(groupBy as 'month' | 'quarter' | 'year', state as string);
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
      const { state } = req.query;
      const distribution = await storage.getTaxonomicDistribution(state as string);
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
        species,
        collector
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
        species as string,
        collector as string
      );
      
      console.log(`[DEBUG] Record index query - limit: ${limit}, offset: ${offset}, stateFirstsOnly: ${stateFirstsOnly}, state: ${state}, species: ${species}, collector: ${collector}, returned: ${index.length} records`);
      
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

  app.post("/api/auto-populate-classification-updates", async (req, res) => {
    try {
      console.log('Manual trigger: Starting automated classification updates...');
      await autoPopulateClassificationUpdates();
      res.json({ message: "Automated classification updates completed successfully" });
    } catch (error) {
      console.error("Error in automated classification updates:", error);
      res.status(500).json({ error: "Failed to run automated classification updates" });
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
    
    // Use optimized approach: get aggregated data and bulk upsert
    try {
      const startTime = Date.now();
      
      // Get aggregated species data efficiently
      const speciesStats = await storage.getTopSpecies(50000);
      console.log(`Found ${speciesStats.length} unique species to update`);
      
      // Process in batches for better performance
      const batchSize = 1000;
      for (let i = 0; i < speciesStats.length; i += batchSize) {
        const batch = speciesStats.slice(i, i + batchSize);
        
        // Process batch concurrently
        await Promise.all(batch.map(async (speciesItem) => {
          await storage.upsertSpecies({
            scientificName: speciesItem.scientificName,
            commonName: speciesItem.commonName,
            phylum: speciesItem.phylum,
            class: speciesItem.class,
            order: speciesItem.order,
            family: speciesItem.family,
            observationCount: speciesItem.observationCount
          });
        }));
        
        // Progress indicator for large datasets
        if (speciesStats.length > 5000) {
          const progress = Math.round(((i + batchSize) / speciesStats.length) * 100);
          console.log(`Species statistics progress: ${Math.min(progress, 100)}% (${Math.min(i + batchSize, speciesStats.length)}/${speciesStats.length})`);
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`✓ Species statistics completed in ${duration}ms - ${speciesStats.length} species processed`);
    } catch (error) {
      console.error('Error in species statistics update:', error);
      console.log('Species statistics update failed');
    }
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

      // Insert observations in batches with enhanced monitoring
      const batchSize = 500; // Reduced batch size for better stability
      let insertedCount = 0;
      const totalBatches = Math.ceil(observations.length / batchSize);
      
      console.log(`Starting batch insert with enhanced monitoring...`);
      console.log(`Total records: ${observations.length}, Batch size: ${batchSize}, Total batches: ${totalBatches}`);
      
      for (let i = 0; i < observations.length; i += batchSize) {
        const batchNum = Math.floor(i/batchSize) + 1;
        const batch = observations.slice(i, i + batchSize);
        const recordRange = `${i + 1}-${Math.min(i + batchSize, observations.length)}`;
        
        console.log(`[${new Date().toISOString()}] Starting batch ${batchNum}/${totalBatches} (records ${recordRange})`);
        
        try {
          const startTime = Date.now();
          await storage.createObservations(batch);
          const endTime = Date.now();
          insertedCount += batch.length;
          
          const batchDuration = endTime - startTime;
          const avgTimePerRecord = batchDuration / batch.length;
          const progressPercent = ((insertedCount / observations.length) * 100).toFixed(1);
          
          console.log(`✓ Batch ${batchNum}/${totalBatches} completed in ${batchDuration}ms (${avgTimePerRecord.toFixed(1)}ms/record)`);
          console.log(`  Total inserted: ${insertedCount}/${observations.length} (${progressPercent}%)`);
          
          // Memory usage monitoring
          const memUsage = process.memoryUsage();
          const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
          console.log(`  Memory usage: ${memMB}MB heap, ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS`);
          
        } catch (batchError) {
          console.error(`✗ BATCH ERROR - Batch ${batchNum}/${totalBatches} failed:`, {
            error: batchError.message,
            batchSize: batch.length,
            recordRange,
            insertedSoFar: insertedCount,
            memoryUsage: process.memoryUsage()
          });
          throw batchError;
        }
        
        // Progress milestones
        if (insertedCount % 2500 === 0) {
          console.log(`=== PROGRESS MILESTONE: ${insertedCount} observations inserted ===`);
        }
        
        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log(`✓ Successfully inserted ${insertedCount} observations total`);

      // Update all index tables and statistics with monitoring
      console.log(`[${new Date().toISOString()}] Starting post-insertion processing...`);
      
      try {
        console.log('Phase 1: Updating contributor statistics...');
        const contribStart = Date.now();
        await updateContributorStatistics();
        console.log(`✓ Contributor statistics completed in ${Date.now() - contribStart}ms`);
        
        console.log('Phase 2: Updating species statistics...');
        const speciesStart = Date.now();
        await updateSpeciesStatistics();
        console.log(`✓ Species statistics completed in ${Date.now() - speciesStart}ms`);
        
        console.log('Phase 3: Building GPS index for map performance...');
        const gpsStart = Date.now();
        await storage.buildGpsIndex();
        console.log(`✓ GPS index completed in ${Date.now() - gpsStart}ms`);
        
        console.log('✓ All index tables updated successfully');

        // Auto-populate classification updates by matching genus
        console.log('Phase 4: Starting automated classification updates...');
        const classificationStart = Date.now();
        await autoPopulateClassificationUpdates();
        console.log(`✓ Automated classification updates completed in ${Date.now() - classificationStart}ms`);

        // Update upload status
        console.log(`[${new Date().toISOString()}] Upload processing completed successfully`);
        await storage.updateUploadStatus(uploadId, 'completed');
        
      } catch (postError) {
        console.error(`✗ POST-INSERTION ERROR during processing:`, {
          error: postError.message,
          stack: postError.stack,
          uploadId,
          insertedRecords: insertedCount
        });
        await storage.updateUploadStatus(uploadId, 'failed', `Post-insertion error: ${postError.message}`);
        throw postError;
      }

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

  async function autoPopulateClassificationUpdates() {
    console.log('Starting automated classification updates by genus matching...');
    
    try {
      // Get all observations with classification update flags
      const classificationUpdates = await storage.getObservationsWithClassificationUpdates();
      console.log(`Found ${classificationUpdates.length} records needing classification updates`);
      
      if (classificationUpdates.length === 0) {
        console.log('No classification updates needed');
        return;
      }
      
      // Get all observations that have complete taxonomy (to use as reference)
      const allObservations = await storage.getAllObservations();
      
      // Create a genus lookup map from complete taxonomy records
      const genusLookup = new Map();
      
      allObservations.forEach(obs => {
        if (obs.genus && obs.kingdom && obs.phylum && obs.class && 
            obs.order && obs.family) {
          // Only use records with complete taxonomy as reference
          const genusKey = obs.genus.toLowerCase().trim();
          if (!genusLookup.has(genusKey)) {
            genusLookup.set(genusKey, {
              kingdom: obs.kingdom,
              phylum: obs.phylum,
              class: obs.class,
              order: obs.order,
              family: obs.family,
              genus: obs.genus
            });
          }
        }
      });
      
      console.log(`Built genus lookup table with ${genusLookup.size} complete taxonomy references`);
      
      let updatedCount = 0;
      const batchSize = 100;
      
      // Process classification updates in batches
      for (let i = 0; i < classificationUpdates.length; i += batchSize) {
        const batch = classificationUpdates.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(classificationUpdates.length/batchSize)}`);
        
        for (const record of batch) {
          try {
            // Extract first word from Species or Variety
            let genusCandidate = null;
            
            if (record.species) {
              genusCandidate = record.species.split(' ')[0].toLowerCase().trim();
            } else if (record.infraspecies) { // Variety field
              genusCandidate = record.infraspecies.split(' ')[0].toLowerCase().trim();
            }
            
            if (genusCandidate && genusLookup.has(genusCandidate)) {
              const taxonomyRef = genusLookup.get(genusCandidate);
              
              // Update the record with missing taxonomy
              const updateData = {
                kingdom: record.kingdom || taxonomyRef.kingdom,
                phylum: record.phylum || taxonomyRef.phylum,
                class: record.class || taxonomyRef.class,
                order: record.order || taxonomyRef.order,
                family: record.family || taxonomyRef.family,
                genus: record.genus || taxonomyRef.genus,
                classificationUpdate: false // Remove the flag
              };
              
              // Use storage method to update the observation
              await storage.updateObservationTaxonomy(record.id, updateData);
              updatedCount++;
              
              console.log(`✓ Updated record ${record.id}: "${genusCandidate}" matched to ${taxonomyRef.genus} family`);
            }
          } catch (recordError) {
            console.error(`Error updating record ${record.id}:`, recordError);
          }
        }
      }
      
      console.log(`✓ Automated classification updates completed: ${updatedCount} records updated`);
      
    } catch (error) {
      console.error('Error in automated classification updates:', error);
    }
  }

  // Red List assessments routes
  app.get("/api/redlist-assessments", async (req, res) => {
    try {
      const assessments = await storage.getRedlistAssessments();
      res.json(assessments);
    } catch (error) {
      console.error('Error fetching Red List assessments:', error);
      res.status(500).json({ error: 'Failed to fetch Red List assessments' });
    }
  });

  // Upload and process Red List CSV
  app.post("/api/redlist-upload", uploadMemory.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log(`Processing Red List CSV upload: ${req.file.originalname}`);
      
      // Process the CSV file using csv-parser for proper handling of quoted values
      const assessments: any[] = [];
      let processedCount = 0;
      let errorCount = 0;
      
      // Convert buffer to string and create a readable stream
      const csvString = req.file.buffer.toString('utf-8');
      const { Readable } = await import('stream');
      
      await new Promise<void>((resolve, reject) => {
        Readable.from([csvString])
          .pipe(csv())
          .on('data', (row: any) => {
            try {
              // Get scientific name from various possible column headers
              const scientificName = row.scientificName || row['Scientific Name'] || row['scientific_name'] || row.taxonname || row['Taxon Name'];
              if (!scientificName?.trim()) return;
              
              const assessment = {
                assessmentId: row.assessmentId || row['Assessment ID'] || `auto-${Date.now()}-${processedCount}`,
                internalTaxonId: row.internalTaxonId || row['Internal Taxon ID'] || null,
                scientificName: scientificName.trim(),
                redlistCategory: row.redlistCategory || row['Redlist Category'] || row.category || null,
                redlistCriteria: row.redlistCriteria || row['Redlist Criteria'] || row.criteria || null,
                yearPublished: row.yearPublished || row['Year Published'] ? parseInt(row.yearPublished || row['Year Published']) : null,
                assessmentDate: row.assessmentDate || row['Assessment Date'] ? new Date(row.assessmentDate || row['Assessment Date']) : null,
                criteriaVersion: row.criteriaVersion || row['Criteria Version'] || null,
                language: row.language || row.Language || null,
                rationale: row.rationale || row.Rationale || null,
                habitat: row.habitat || row.Habitat || null,
                threats: row.threats || row.Threats || null,
                population: row.population || row.Population || null,
                populationTrend: row.populationTrend || row['Population Trend'] || null,
                range: row.range || row.Range || null,
                useTrade: row.useTrade || row['Use Trade'] || null,
                systems: row.systems || row.Systems || null,
                conservationActions: row.conservationActions || row['Conservation Actions'] || null,
                realm: row.realm || row.Realm || null,
                yearLastSeen: row.yearLastSeen || row['Year Last Seen'] ? parseInt(row.yearLastSeen || row['Year Last Seen']) : null,
                possiblyExtinct: (row.possiblyExtinct || row['Possibly Extinct']) === 'true',
                possiblyExtinctInTheWild: (row.possiblyExtinctInTheWild || row['Possibly Extinct in the Wild']) === 'true',
                scopes: row.scopes || row.Scopes || null
              };
              
              assessments.push(assessment);
              processedCount++;
            } catch (rowError) {
              console.error(`Error processing row:`, rowError);
              errorCount++;
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
      
      console.log(`Parsed ${assessments.length} Red List assessments from CSV`);
      
      // Save to database with conflict handling
      const savedAssessments = await storage.createRedlistAssessments(assessments);
      const savedCount = savedAssessments.length;
      
      console.log(`✓ Red List upload completed: ${savedCount} assessments saved`);
      
      res.json({
        success: true,
        message: `Successfully processed ${savedCount} Red List assessments`,
        stats: {
          totalProcessed: processedCount,
          saved: savedCount,
          errors: errorCount
        }
      });
      
    } catch (error) {
      console.error('Error processing Red List upload:', error);
      res.status(500).json({ 
        error: 'Failed to process Red List upload',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Clear Red List assessments
  app.delete("/api/redlist-assessments", async (req, res) => {
    try {
      await storage.clearRedlistAssessments();
      res.json({ success: true, message: 'All Red List assessments cleared' });
    } catch (error) {
      console.error('Error clearing Red List assessments:', error);
      res.status(500).json({ error: 'Failed to clear Red List assessments' });
    }
  });

  // iNaturalist data endpoints
  app.get("/api/inaturalist", async (req, res) => {
    try {
      const { observationId } = req.query;
      const data = await storage.getInaturalistData(observationId as string);
      res.json(data);
    } catch (error) {
      console.error("Error fetching iNaturalist data:", error);
      res.status(500).json({ error: "Failed to fetch iNaturalist data" });
    }
  });

  app.post("/api/inaturalist/sync/:observationId", async (req, res) => {
    try {
      const { observationId } = req.params;
      console.log(`[iNaturalist] Syncing observation ${observationId}`);
      
      const result = await storage.syncObservationWithInaturalist(observationId);
      if (result) {
        res.json({ success: true, data: result });
      } else {
        res.status(404).json({ error: "Failed to sync observation" });
      }
    } catch (error) {
      console.error("Error syncing iNaturalist data:", error);
      res.status(500).json({ error: "Failed to sync iNaturalist data" });
    }
  });

  app.get("/api/observations/validation", async (req, res) => {
    try {
      const { limit = 50, source = 'all' } = req.query;
      
      // Get observations with their iNaturalist sync status
      const observations = await storage.getAllObservations();
      
      // Filter by source if specified
      let filteredObs = observations;
      if (source === 'inaturalist') {
        filteredObs = observations.filter(obs => obs.source?.toLowerCase() === 'inaturalist');
      } else if (source === 'mo') {
        filteredObs = observations.filter(obs => obs.source?.toLowerCase() === 'mushroom observer');
      }
      
      // Get iNaturalist data for each observation
      const validationData = await Promise.all(
        filteredObs.slice(0, parseInt(limit as string)).map(async (obs) => {
          const inatData = await storage.getInaturalistData(obs.observationId);
          const inatRecord = inatData[0];
          
          // Extract iNaturalist comparison data from taxon and user JSON
          let inatScientificName = null;
          let inatObserver = null;
          let inatObservedOn = null;
          let inatState = null;
          
          if (inatRecord) {
            try {
              if (inatRecord.taxon) {
                const taxonData = JSON.parse(inatRecord.taxon);
                inatScientificName = taxonData.name || null;
              }
              if (inatRecord.user) {
                const userData = JSON.parse(inatRecord.user);
                inatObserver = userData.name || userData.login || null;
              }
              inatObservedOn = inatRecord.observedOnString || null;
              // Extract state from place data using place ID lookup
              if (inatRecord.place_ids && inatRecord.place_ids.length > 0) {
                try {
                  // Use the new place ID resolution system
                  inatState = await storage.resolveStateFromPlaceIds(inatRecord.place_ids);
                  
                  // If no state found from place IDs, try to extract from place_guess
                  if (!inatState && inatRecord.place_guess) {
                    const placeGuess = inatRecord.place_guess.toLowerCase();
                    const stateNames = {
                      'alabama': 'Alabama', 'alaska': 'Alaska', 'arizona': 'Arizona', 'arkansas': 'Arkansas',
                      'california': 'California', 'colorado': 'Colorado', 'connecticut': 'Connecticut',
                      'delaware': 'Delaware', 'florida': 'Florida', 'georgia': 'Georgia', 'hawaii': 'Hawaii',
                      'idaho': 'Idaho', 'illinois': 'Illinois', 'indiana': 'Indiana', 'iowa': 'Iowa',
                      'kansas': 'Kansas', 'kentucky': 'Kentucky', 'louisiana': 'Louisiana', 'maine': 'Maine',
                      'maryland': 'Maryland', 'massachusetts': 'Massachusetts', 'michigan': 'Michigan',
                      'minnesota': 'Minnesota', 'mississippi': 'Mississippi', 'missouri': 'Missouri',
                      'montana': 'Montana', 'nebraska': 'Nebraska', 'nevada': 'Nevada', 'new hampshire': 'New Hampshire',
                      'new jersey': 'New Jersey', 'new mexico': 'New Mexico', 'new york': 'New York',
                      'north carolina': 'North Carolina', 'north dakota': 'North Dakota', 'ohio': 'Ohio',
                      'oklahoma': 'Oklahoma', 'oregon': 'Oregon', 'pennsylvania': 'Pennsylvania',
                      'rhode island': 'Rhode Island', 'south carolina': 'South Carolina', 'south dakota': 'South Dakota',
                      'tennessee': 'Tennessee', 'texas': 'Texas', 'utah': 'Utah', 'vermont': 'Vermont',
                      'virginia': 'Virginia', 'washington': 'Washington', 'west virginia': 'West Virginia',
                      'wisconsin': 'Wisconsin', 'wyoming': 'Wyoming',
                      // Common abbreviations
                      ' wa': 'Washington', ' ca': 'California', ' tx': 'Texas', ' fl': 'Florida',
                      ' ny': 'New York', ' pa': 'Pennsylvania', ' or': 'Oregon', ' co': 'Colorado'
                    };
                    
                    for (const [key, value] of Object.entries(stateNames)) {
                      if (placeGuess.includes(key)) {
                        inatState = value;
                        break;
                      }
                    }
                  }
                } catch (e) {
                  console.error('Error extracting state from place data:', e);
                }
              }
            } catch (e) {
              console.error('Error parsing iNaturalist JSON data:', e);
            }
          }
          
          return {
            ...obs,
            inatSyncStatus: inatRecord?.syncStatus || 'pending',
            inatLastSynced: inatRecord?.lastSyncedAt || null,
            inatSyncError: inatRecord?.syncError || null,
            hasInatData: inatData.length > 0,
            dnaBarcode: inatRecord?.dnaBarcode || null,
            provisionalSpeciesName: inatRecord?.provisionalSpeciesName || null,
            mycoMapBlastResults: inatRecord?.mycoMapBlastResults || null,
            traceFiles: inatRecord?.traceFiles || null,
            // Trace file download tracking
            traceFilesDownloaded: obs.traceFilesDownloaded || false,
            fastqFile: obs.fastqFile || null,
            mycoMapTraceUrl: obs.mycoMapTraceUrl || null,
            // Comparison data
            inatScientificName,
            inatObserver,
            inatObservedOn,
            inatState,
          };
        })
      );

      res.json(validationData);
    } catch (error) {
      console.error("Error fetching validation data:", error);
      res.status(500).json({ error: "Failed to fetch validation data" });
    }
  });

  // BLAST file download endpoints
  app.post("/api/observations/:id/download-blast", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { blastUrl } = req.body;

      if (!blastUrl) {
        return res.status(400).json({ error: "BLAST URL is required" });
      }

      console.log(`[BLAST] Starting download for observation ${observationId}`);
      
      // Download BLAST files
      const result = await blastDownloader.downloadBlastFiles(observationId, blastUrl);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Update observation record with BLAST file information
      await storage.updateObservationTaxonomy(parseInt(observationId), {
        mycoMapBlastUrl: blastUrl,
        ncbiBlastFile: result.ncbiPath ? path.basename(result.ncbiPath) : null,
        localBlastFile: result.localPath ? path.basename(result.localPath) : null,
        blastFilesDownloaded: true,
        blastDownloadDate: new Date()
      });

      res.json({
        success: true,
        ncbiFile: result.ncbiPath ? path.basename(result.ncbiPath) : null,
        localFile: result.localPath ? path.basename(result.localPath) : null
      });

    } catch (error) {
      console.error(`[BLAST] Error downloading files:`, error);
      res.status(500).json({ error: "Failed to download BLAST files" });
    }
  });

  // Check BLAST file status
  app.get("/api/observations/:id/blast-status", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { ncbiExists, localExists } = await blastDownloader.checkExistingFiles(observationId);
      
      res.json({
        ncbiExists,
        localExists,
        bothExist: ncbiExists && localExists
      });
    } catch (error) {
      console.error(`[BLAST] Error checking file status:`, error);
      res.status(500).json({ error: "Failed to check BLAST file status" });
    }
  });

  // Serve downloaded BLAST files
  app.get("/api/blast-files/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'blast', filename);
      
      console.log(`[BLAST] Serving file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[BLAST] File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
      }

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      console.error(`[BLAST] Error serving file:`, error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Trace file download endpoints
  app.post("/api/observations/:id/download-trace", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { traceUrl } = req.body;

      if (!traceUrl) {
        return res.status(400).json({ error: "Trace URL is required" });
      }

      console.log(`[TRACE] Starting download for observation ${observationId}`);
      
      // Download trace files
      const result = await blastDownloader.downloadTraceFiles(observationId, traceUrl);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      // Update observation record with trace file information
      await storage.updateObservationTaxonomy(parseInt(observationId), {
        mycoMapTraceUrl: traceUrl,
        fastqFile: result.fastqPath ? path.basename(result.fastqPath) : null,
        traceFilesDownloaded: true,
        traceDownloadDate: new Date()
      });

      res.json({
        success: true,
        fastqFile: result.fastqPath ? path.basename(result.fastqPath) : null
      });

    } catch (error) {
      console.error(`[TRACE] Error downloading files:`, error);
      res.status(500).json({ error: "Failed to download trace files" });
    }
  });

  // Check trace file status
  app.get("/api/observations/:id/trace-status", async (req, res) => {
    try {
      const observationId = req.params.id;
      const { fastqExists } = await blastDownloader.checkExistingTraceFiles(observationId);
      
      res.json({
        fastqExists
      });
    } catch (error) {
      console.error(`[TRACE] Error checking file status:`, error);
      res.status(500).json({ error: "Failed to check trace file status" });
    }
  });

  // Serve downloaded trace files
  app.get("/api/trace-files/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'downloads', 'trace', filename);
      
      console.log(`[TRACE] Working directory: ${process.cwd()}`);
      console.log(`[TRACE] Serving file: ${filePath}`);
      console.log(`[TRACE] File exists: ${fs.existsSync(filePath)}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[TRACE] File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
      }

      const absolutePath = path.resolve(filePath);
      console.log(`[TRACE] Absolute path: ${absolutePath}`);
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.sendFile(absolutePath);
    } catch (error) {
      console.error(`[TRACE] Error serving file:`, error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
