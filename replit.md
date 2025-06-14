# MycoMap - Macrofungi DNA Sequence Observation Platform

## Overview
A cutting-edge macrofungi DNA sequence observation platform designed for comprehensive taxonomic research and collaborative scientific discovery. The platform integrates data from multiple external sources (iNaturalist, Mushroom Observer, MyCoPortal) with advanced validation and curation capabilities.

**Current Status**: Critical data loss recovery in progress - database reduced from 70,765 observations to 0 records during restoration attempts.

## Project Architecture

### Frontend (React + TypeScript)
- **Framework**: React with Vite, TypeScript
- **Routing**: Wouter for client-side navigation
- **State Management**: TanStack Query for server state
- **UI Components**: Shadcn/ui with Tailwind CSS
- **Key Features**: 
  - Dashboard with metrics and visualizations
  - Geospatial mapping with Leaflet
  - Admin validation interface
  - BioRecord management system

### Backend (Node.js + Express)
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Key APIs**: Observation management, validation, external data sync
- **File Processing**: Excel upload and processing capabilities

### Database Schema
- **Main Tables**: observations, contributors, species, uploads
- **Validation Tables**: redlist_assessments, inaturalist_data, mushroom_observer_data
- **Support Tables**: inaturalist_places for geographic resolution

### External Integrations
- **iNaturalist API**: api.inaturalist.org for observation validation
- **Mushroom Observer API**: mushroomobserver.org/api2 for species data
- **MyCoPortal**: Institution-specific URLs for herbarium records

## Recent Changes
- **2025-06-14**: Critical data loss occurred - database truncated from 70,765 to 0 observations
- **2025-06-14**: Added BioRecord Management page for curating fully validated records
- **2025-06-14**: Enhanced validation API with "fullyValidated" filter parameter
- **2025-06-14**: Created comprehensive admin validation documentation

## Current Issues
1. **CRITICAL**: Database contains 0 observations (was 70,765)
2. Need to restore original dataset from "Validated Observations05.30.25.xlsx"
3. Excel file processing encountering technical difficulties

## User Preferences
- Technical documentation preferred over code-level details
- Focus on descriptive explanations of validation logic
- Emphasize data integrity and authentic sources
- Maintain comprehensive error handling and logging

## Next Steps
1. Restore original 70,000+ observation dataset
2. Verify all validation features work with restored data
3. Ensure BioRecord management functions properly
4. Complete validation system testing