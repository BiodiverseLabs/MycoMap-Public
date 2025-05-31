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
      const { startDate, endDate, state } = req.query;
      
      let observations;
      if (startDate && endDate) {
        observations = await storage.getObservationsByDateRange(
          startDate as string, 
          endDate as string
        );
      } else if (state) {
        observations = await storage.getObservationsByState(state as string);
      } else {
        observations = await storage.getAllObservations();
      }
      
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations:", error);
      res.status(500).json({ error: "Failed to fetch observations" });
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

  app.get("/api/taxonomic-distribution", async (req, res) => {
    try {
      const distribution = await storage.getTaxonomicDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching taxonomic distribution:", error);
      res.status(500).json({ error: "Failed to fetch taxonomic distribution" });
    }
  });

  app.get("/api/contributors", async (req, res) => {
    try {
      const { limit = '10', dateRange } = req.query;
      
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
      
      const contributors = await storage.getTopContributors(parseInt(limit as string), actualStartDate, actualEndDate);
      res.json(contributors);
    } catch (error) {
      console.error("Error fetching contributors:", error);
      res.status(500).json({ error: "Failed to fetch contributors" });
    }
  });

  app.get("/api/species", async (req, res) => {
    try {
      const { limit = '10', type = 'top' } = req.query;
      
      let species;
      if (type === 'rare') {
        species = await storage.getRareSpecies(parseInt(limit as string));
      } else {
        species = await storage.getTopSpecies(parseInt(limit as string));
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
      const { limit = '50', offset = '0', stateFirstsOnly = 'false', recent = 'false' } = req.query;
      const index = await storage.getRecordIndex(
        parseInt(limit as string), 
        parseInt(offset as string),
        stateFirstsOnly === 'true',
        recent === 'true'
      );
      res.json(index);
    } catch (error) {
      console.error("Error fetching record index:", error);
      res.status(500).json({ error: "Failed to fetch record index" });
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
          source: row['Source'] || row['source'] || 'Unknown',
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
