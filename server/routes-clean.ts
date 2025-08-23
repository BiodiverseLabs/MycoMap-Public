import express from "express";
import { db } from "./db";
import { fieldGuides, fieldGuideSpecies, observations, contributors, species as speciesTable } from "@shared/schema";
import { eq, sql, and, gte, lte, desc, asc, count } from "drizzle-orm";

export function createRouter() {
  const app = express.Router();

  // Get species for a field guide with unified iNat API logic
  app.get("/field-guides/:id/species", async (req, res) => {
    try {
      const { id } = req.params;
      const { expansion, monthStart, monthEnd, includeInat } = req.query;
      const fieldGuideId = parseInt(id);
      const expansionMiles = expansion ? parseFloat(expansion as string) : 0;
      
      console.log(`[Species API] Query params:`, { expansion, monthStart, monthEnd, includeInat });
      console.log(`[Species API] Parsed values:`, { fieldGuideId, expansionMiles, includeInatBool: includeInat === 'true' });
      
      // Get the field guide to get bounding box coordinates
      const guide = await db.select().from(fieldGuides).where(eq(fieldGuides.id, fieldGuideId)).limit(1);
      
      if (guide.length === 0) {
        return res.status(404).json({ error: "Field guide not found" });
      }
      
      const { boundingBoxNorth, boundingBoxSouth, boundingBoxEast, boundingBoxWest } = guide[0];
      
      // Calculate final bounding box (original or expanded based on expansion parameter)
      let queryNorth, querySouth, queryEast, queryWest;
      
      if (expansionMiles > 0) {
        // Convert miles to degrees and expand the bounding box
        const latDelta = expansionMiles * 0.014483;
        const avgLat = (parseFloat(boundingBoxNorth) + parseFloat(boundingBoxSouth)) / 2;
        const lngDelta = expansionMiles * 0.014483 / Math.cos(avgLat * Math.PI / 180);
        
        queryNorth = parseFloat(boundingBoxNorth) + latDelta;
        querySouth = parseFloat(boundingBoxSouth) - latDelta;
        queryEast = parseFloat(boundingBoxEast) + lngDelta;
        queryWest = parseFloat(boundingBoxWest) - lngDelta;
      } else {
        // Use original bounding box
        queryNorth = parseFloat(boundingBoxNorth);
        querySouth = parseFloat(boundingBoxSouth);
        queryEast = parseFloat(boundingBoxEast);
        queryWest = parseFloat(boundingBoxWest);
      }
      
      // Build month filter conditions for database query
      let monthCondition = '';
      if (monthStart && monthEnd) {
        const startMonth = parseInt(monthStart as string);
        const endMonth = parseInt(monthEnd as string);
        if (startMonth <= endMonth) {
          monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) BETWEEN ${startMonth} AND ${endMonth}`;
        } else {
          monthCondition = `AND (EXTRACT(MONTH FROM o.observed_on) >= ${startMonth} OR EXTRACT(MONTH FROM o.observed_on) <= ${endMonth})`;
        }
      } else if (monthStart) {
        monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) >= ${parseInt(monthStart as string)}`;
      } else if (monthEnd) {
        monthCondition = `AND EXTRACT(MONTH FROM o.observed_on) <= ${parseInt(monthEnd as string)}`;
      }

      // Query database for species in the calculated bounding box
      const speciesInBoxResult = await db.execute(sql`
        SELECT 
          o.scientific_name,
          o.common_name,
          o.family,
          COUNT(*) as observation_count
        FROM observations o
        WHERE o.latitude IS NOT NULL 
          AND o.longitude IS NOT NULL
          AND CAST(o.latitude AS DECIMAL) <= ${queryNorth}
          AND CAST(o.latitude AS DECIMAL) >= ${querySouth}
          AND CAST(o.longitude AS DECIMAL) <= ${queryEast}
          AND CAST(o.longitude AS DECIMAL) >= ${queryWest}
          AND o.scientific_name IS NOT NULL
          AND o.scientific_name != ''
          AND o.observed_on IS NOT NULL
          ${sql.raw(monthCondition)}
        GROUP BY o.scientific_name, o.common_name, o.family
        ORDER BY o.scientific_name
      `);
      
      // Convert to species format
      let finalSpecies = speciesInBoxResult.rows.map((row: any) => ({
        id: null,
        fieldGuideId: fieldGuideId,
        scientificName: row.scientific_name,
        commonName: row.common_name,
        family: row.family,
        observationCount: parseInt(row.observation_count),
        selectedImageUrl: null,
        selectedImageSource: null,
        selectedObservationId: null,
        selectedImageId: null,
        source: 'Database'
      }));
      
      // Add iNaturalist supplementation if requested
      if (includeInat === 'true') {
        try {
          const areaDescription = expansionMiles > 0 ? `expanded area (${expansionMiles} miles)` : 'original bounding box';
          console.log(`[iNat API] Fetching fungal observations for ${areaDescription}`);
          
          const inatParams = new URLSearchParams({
            swlat: querySouth.toString(),
            swlng: queryWest.toString(), 
            nelat: queryNorth.toString(),
            nelng: queryEast.toString(),
            iconic_taxa: 'Fungi',
            quality_grade: 'research',
            per_page: '200',
            order_by: 'species_guess',
            order: 'asc'
          });
          
          // Add month filter if specified
          if (monthStart && monthEnd) {
            inatParams.set('month', `${monthStart},${monthEnd}`);
          } else if (monthStart) {
            inatParams.set('month', monthStart as string);
          } else if (monthEnd) {
            inatParams.set('month', monthEnd as string);
          }

          // Fetch all pages of iNaturalist data with pagination
          const allInatObservations = [];
          let page = 1;
          let totalResults = 0;
          
          do {
            inatParams.set('page', page.toString());
            const pagedUrl = `https://api.inaturalist.org/v1/observations?${inatParams.toString()}`;
            
            const inatResponse = await fetch(pagedUrl, {
              headers: {
                'User-Agent': 'MycoMap Field Guide - Supplemental Species Discovery'
              }
            });

            console.log(`[iNat API] Page ${page} - Response status: ${inatResponse.status}`);
            if (inatResponse.ok) {
              const inatData = await inatResponse.json();
              totalResults = inatData.total_results || 0;
              
              console.log(`[iNat API] Page ${page}: Found ${inatData.results?.length || 0} observations (Total available: ${totalResults})`);
              
              if (inatData.results && inatData.results.length > 0) {
                allInatObservations.push(...inatData.results);
                page++;
                
                // Safety limit
                if (allInatObservations.length >= 5000 || page > 25) {
                  console.log(`[iNat API] Reached limit of ${allInatObservations.length} observations, stopping pagination`);
                  break;
                }
              } else {
                break; // No more results
              }
            } else {
              console.log(`[iNat API] Page ${page} failed: ${inatResponse.status} ${inatResponse.statusText}`);
              break;
            }
          } while (allInatObservations.length < totalResults && page <= 25);
          
          console.log(`[iNat API] Total fetched: ${allInatObservations.length} observations across ${page-1} pages`);
          
          if (allInatObservations.length > 0) {
            // Process iNaturalist observations into species format
            const inatSpeciesMap = new Map();
            allInatObservations.forEach((obs: any) => {
              if (obs.taxon && obs.taxon.name && obs.taxon.rank === 'species') {
                if (!inatSpeciesMap.has(obs.taxon.name)) {
                  inatSpeciesMap.set(obs.taxon.name, {
                    id: null,
                    fieldGuideId: fieldGuideId,
                    scientificName: obs.taxon.name,
                    commonName: obs.taxon.preferred_common_name || null,
                    family: obs.taxon.ancestors?.find((a: any) => a.rank === 'family')?.name || null,
                    observationCount: 0,
                    selectedImageUrl: null,
                    selectedImageSource: null,
                    selectedObservationId: null,
                    selectedImageId: null,
                    source: 'iNaturalist'
                  });
                }
                inatSpeciesMap.get(obs.taxon.name).observationCount++;
              }
            });
            
            const inatSpecies = Array.from(inatSpeciesMap.values());
            
            // Merge with database species
            const allSpeciesMap = new Map();
            finalSpecies.forEach(species => allSpeciesMap.set(species.scientificName, species));
            inatSpecies.forEach(species => {
              if (!allSpeciesMap.has(species.scientificName)) {
                allSpeciesMap.set(species.scientificName, species);
              }
            });
            
            finalSpecies = Array.from(allSpeciesMap.values())
              .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
            
            console.log(`[iNat API] Final merged list: ${finalSpecies.length} species (${speciesInBoxResult.rows.length} from DB, ${inatSpecies.length} from iNat)`);
          }
        } catch (error) {
          console.error(`[iNat API] Error supplementing species list:`, error);
        }
      }
      
      return res.json(finalSpecies);
    } catch (error) {
      console.error("Error fetching field guide species:", error);
      res.status(500).json({ error: "Failed to fetch field guide species" });
    }
  });

  return app;
}