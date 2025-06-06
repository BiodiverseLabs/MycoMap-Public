# Admin Validation Page - Technical Documentation

## Overview
The Admin Validation page (`/admin/validation`) is a comprehensive data validation interface for biological observation records from three primary sources: iNaturalist, Mushroom Observer (MO), and MyCoPortal. This document provides complete implementation details for recreating the functionality.

## Data Model & TypeScript Interface

### ValidationObservation Interface
```typescript
interface ValidationObservation {
  id: number;
  observationId: string;
  scientificName: string;
  commonName: string | null;
  observer: string | null;
  collector: string | null;
  observedOn: string | null;
  state: string | null;
  source: string;
  
  // iNaturalist sync tracking
  inatSyncStatus: 'pending' | 'success' | 'error';
  inatLastSynced: string | null;
  inatSyncError: string | null;
  hasInatData: boolean;
  
  // DNA & BLAST tracking
  dnaBarcode?: string | null;
  provisionalSpeciesName?: string | null;
  mycoMapBlastResults?: string | null;
  traceFiles?: string | null;
  blastFilesDownloaded?: boolean;
  ncbiBlastFile?: string | null;
  localBlastFile?: string | null;
  traceFilesDownloaded?: boolean;
  fastqFile?: string | null;
  mycoMapTraceUrl?: string | null;
  
  // iNaturalist comparison data
  inatObserver?: string | null;
  inatObservedOn?: string | null;
  inatState?: string | null;
  inatScientificName?: string | null;
  inatGenbankAccession?: string | null;
  inatApiSaved?: boolean;
  inatApiFile?: string | null;
  inatApiSaveDate?: string | null;
  
  // Mushroom Observer data
  hasMoData?: boolean;
  moId?: string | null;
  moSyncStatus?: 'pending' | 'success' | 'error' | null;
  moLastSynced?: string | null;
  moSyncError?: string | null;
  moScientificName?: string | null;
  moObserver?: string | null;
  moObservedOn?: string | null;
  moState?: string | null;
  moDnaBarcode?: string | null;
  moSequenceNotes?: string | null;
  moApiSaved?: boolean;
  moApiFile?: string | null;
  moApiSaveDate?: string | null;
  
  // MyCoPortal data
  hasMycoportalData?: boolean;
  mycoportalCatalogNumber?: string | null;
  mycoportalSyncStatus?: 'pending' | 'success' | 'error' | null;
  mycoportalLastSynced?: string | null;
  mycoportalSyncError?: string | null;
  mycoportalScientificName?: string | null;
  mycoportalRecordedBy?: string | null;
  mycoportalEventDate?: string | null;
  mycoportalState?: string | null;
  mycoportalApiSaved?: boolean;
  mycoportalApiFile?: string | null;
  mycoportalApiSaveDate?: string | null;
  
  // MycoMap data fields
  genbankAccession?: string | null;
}
```

## API Endpoints & Data Fetching

### Primary Data Query
**Endpoint:** `GET /api/observations/validation`

**Query Parameters:**
- `limit`: Number of records to return (default: 50)
- `source`: Filter by data source ('all', 'inaturalist', 'mo', 'mycoportal')
- `syncStatus`: Filter by sync status ('all', 'synced', 'not_synced')
- `validationStatus`: Filter by validation state ('all', 'validated', 'incomplete')
- `search`: Search by observation ID or external platform ID
- `fullyValidated`: Boolean filter for fully validated records

**Example API Call:**
```typescript
const { data: observations = [], isLoading, refetch } = useQuery({
  queryKey: ['/api/observations/validation', sourceFilter, syncFilter, validationFilter, limit, searchQuery],
  queryFn: async () => {
    const params = new URLSearchParams();
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
    if (syncFilter !== 'all') params.append('syncStatus', syncFilter);
    if (validationFilter !== 'all') params.append('validationStatus', validationFilter);
    if (searchQuery.trim()) params.append('search', searchQuery.trim());
    params.append('limit', limit.toString());
    
    const response = await fetch(`/api/observations/validation?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch validation data');
    return response.json();
  }
});
```

### Sync Progress Tracking
**Endpoint:** `GET /api/inaturalist/sync-progress`

**Response Format:**
```typescript
interface SyncProgress {
  isRunning: boolean;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{observationId: string, error: string}>;
  startTime: string | null;
  endTime: string | null;
}
```

## Database Query Logic

### Backend SQL Query Structure
The backend uses a complex SQL query with multiple LEFT JOINs:

```sql
SELECT 
  o.id,
  o.observation_id as "observationId",
  o.scientific_name as "scientificName",
  -- [additional observation fields]
  
  -- iNaturalist data with JSON field extraction
  CASE WHEN i.observation_id IS NOT NULL THEN true ELSE false END as "hasInatData",
  i.sync_status as "inatSyncStatus",
  i.species_guess as "inatScientificName",
  CASE 
    WHEN i.user IS NOT NULL AND i.user != '' THEN 
      COALESCE((i.user::json->>'name'), (i.user::json->>'login'), i.user::text)
    ELSE NULL 
  END as "inatObserver",
  
  -- Geographic data extraction from place_ids array
  CASE 
    WHEN i.place_ids IS NOT NULL AND array_length(i.place_ids, 1) > 0 THEN
      (SELECT p.name FROM inaturalist_places p 
       WHERE p.place_id = ANY(i.place_ids) 
       AND p.admin_level = 10 AND p.place_type::integer = 8
       AND p.display_name LIKE '%, US'
       LIMIT 1)
    ELSE NULL
  END as "inatState",
  
  -- Mushroom Observer data
  CASE WHEN m.observation_id IS NOT NULL THEN true ELSE false END as "hasMoData",
  m.sync_status as "moSyncStatus",
  
  -- MyCoPortal data  
  CASE WHEN mc.observation_id IS NOT NULL THEN true ELSE false END as "hasMycoportalData",
  mc.sync_status as "mycoportalSyncStatus"

FROM observations o
LEFT JOIN inaturalist_data i ON o.observation_id = i.observation_id
LEFT JOIN mushroom_observer_data m ON o.observation_id = m.observation_id
LEFT JOIN mycoportal_data mc ON o.observation_id = mc.observation_id
```

### Fully Validated Filter Logic
When `fullyValidated=true` parameter is passed, additional WHERE conditions are applied:

```sql
WHERE (
  -- Species-level identification (at least 2 words in scientific name)
  array_length(string_to_array(trim(o.scientific_name), ' '), 1) >= 2
  AND
  -- Has iNaturalist data with successful sync
  i.observation_id IS NOT NULL 
  AND i.sync_status = 'success'
  AND
  -- Has iNaturalist API file saved
  o.inat_api_saved = true
  AND
  -- Has BLAST files downloaded when BLAST URL exists (or no BLAST URL required)
  (o.mycomap_blast_url IS NULL OR o.blast_files_downloaded = true)
  AND
  -- Has trace files downloaded when trace URL exists (or no trace URL required)
  (o.mycomap_trace_url IS NULL OR o.trace_files_downloaded = true)
)
```

## Filter Dropdown Logic

### Source Filter
- **all**: No source filtering applied
- **inaturalist**: `o.source = 'iNaturalist'`
- **mo**: `o.source = 'MO Observations'`  
- **mycoportal**: `o.source = 'MycoPortal'`

### Sync Status Filter
- **all**: No sync filtering applied
- **synced**: Records where primary platform sync status = 'success'
- **not_synced**: Records where primary platform sync status ≠ 'success' or is NULL

### Validation Status Filter
- **all**: No validation filtering applied
- **validated**: Records passing all validation criteria (see Validation Logic section)
- **incomplete**: Records failing one or more validation criteria

## Data Comparison Logic

### Field Comparison Function
The system uses a sophisticated comparison function that handles different data types:

```typescript
const compareFields = (
  mycoMapValue: string | null | undefined, 
  externalValue: string | null | undefined, 
  isScientificName = false, 
  provisionalName?: string | null | undefined
) => {
  // Scientific name comparison logic
  if (isScientificName) {
    const targetName = provisionalName || externalValue;
    return (mycoMapValue || '').toLowerCase().trim() === (targetName || '').toLowerCase().trim();
  }
  
  // Date field normalization and comparison
  if (mycoMapValue && externalValue) {
    const datePattern = /\d+[\/\-]\d+[\/\-]\d+/;
    if (datePattern.test(mycoMapValue) && datePattern.test(externalValue)) {
      const normalizeDate = (dateStr: string) => {
        // Handle ISO timestamp: "2024-10-16T00:00:00.000Z" -> "2024-10-16"
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
          return dateStr.split('T')[0];
        }
        
        let dateOnly = dateStr.split(' ')[0]; // Remove time portion
        
        // iNaturalist format: "2024/10/16" -> "2024-10-16"
        if (dateOnly.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
          const parts = dateOnly.split('/');
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
        
        // US format: "10/16/2024" -> "2024-10-16"
        if (dateOnly.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
          const parts = dateOnly.split('/');
          return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
        
        return dateOnly;
      };
      
      return normalizeDate(mycoMapValue) === normalizeDate(externalValue);
    }
  }
  
  // Standard string comparison
  const mycoMap = (mycoMapValue || '').toLowerCase().trim();
  const external = (externalValue || '').toLowerCase().trim();
  return mycoMap === external && mycoMap !== '';
};
```

## Validation Logic Chains

### Individual Field Validation

#### 1. Scientific Name Validation
- **Green Checkmark Criteria:**
  - MycoMap scientific name matches iNaturalist provisional species name (if available)
  - OR MycoMap scientific name matches iNaturalist species guess
  - Comparison is case-insensitive and trimmed
  - Both values must be non-empty

#### 2. Observer/Collector Validation  
- **Green Checkmark Criteria:**
  - MycoMap collector matches iNaturalist observer name
  - iNaturalist observer name extracted from JSON user object (`name` field, fallback to `login`)
  - Case-insensitive comparison

#### 3. Date Validation
- **Green Checkmark Criteria:**
  - MycoMap observed date matches iNaturalist observed date
  - Multiple date format normalization applied (see compareFields function)
  - Handles ISO timestamps, US format, and iNaturalist format

#### 4. Location/State Validation
- **Green Checkmark Criteria:**
  - MycoMap state matches iNaturalist state
  - iNaturalist state extracted from place_ids array using complex geographic lookup
  - Only US administrative level 10 places with place_type 8 are considered

### Overall Record Validation

#### Green Checkmark (Fully Validated) Criteria
A record receives an overall green checkmark when ALL conditions are met:

1. **Has iNaturalist Data:** `hasInatData = true`
2. **Species-Level Identification:** Scientific name contains ≥2 words (genus + species minimum)
3. **API Export Saved:** `inatApiSaved = true`
4. **BLAST Files Downloaded:** If `mycoMapBlastResults` URL exists, `blastFilesDownloaded = true`
5. **Trace Files Downloaded:** If `mycoMapTraceUrl` exists, `traceFilesDownloaded = true`

#### Validation Status Logic
```typescript
const getOverallValidationStatus = (obs: ValidationObservation) => {
  const validationChecks = [
    // Core data comparisons (only if iNaturalist data exists)
    obs.hasInatData ? compareFields(obs.scientificName, obs.provisionalSpeciesName || obs.inatScientificName, true, obs.provisionalSpeciesName) : true,
    obs.hasInatData ? compareFields(obs.collector, obs.inatObserver) : true,
    obs.hasInatData ? compareFields(obs.observedOn, obs.inatObservedOn) : true,
    obs.hasInatData ? compareFields(obs.state, obs.inatState) : true,
    
    // Species-level identification requirement
    isSpeciesLevel(obs.scientificName),
    
    // API file requirements
    obs.hasInatData && obs.inatApiSaved,
    
    // File download requirements (conditional)
    !obs.mycoMapBlastResults || obs.blastFilesDownloaded,
    !obs.mycoMapTraceUrl || obs.traceFilesDownloaded
  ];
  
  return validationChecks.every(check => check);
};
```

## Platform-Specific API Integration

### iNaturalist API Integration

#### Individual Record Sync
**Endpoint:** `POST /api/inaturalist/sync/:observationId`

**Process:**
1. Extract iNaturalist ID from observation ID using regex pattern
2. Rate-limited API call to iNaturalist (1.1 second delay between requests)
3. API URL: `https://api.inaturalist.org/v1/observations/{inatId}`
4. Store complete API response in database
5. Update sync status and timestamp

#### Bulk Sync Operation
**Endpoint:** `POST /api/inaturalist/sync-bulk`

**Request Body:**
```json
{
  "limit": 50,
  "source": "inaturalist"
}
```

**Process:**
1. Filter observations by source and unsynced status
2. Initialize sync progress tracking
3. Process observations sequentially with rate limiting
4. Update progress indicators in real-time
5. Handle and log individual failures

#### API Response Processing
Key fields extracted from iNaturalist API response:
- `species_guess`: Scientific name from iNaturalist
- `user.name` or `user.login`: Observer information
- `observed_on_string`: Observation date
- `place_ids`: Geographic location array
- `photos`: Associated images

### Mushroom Observer Integration

#### Data Synchronization
**Endpoint:** `POST /api/mushroom-observer/sync/:observationId`

**API Integration:**
- Base URL: `https://mushroomobserver.org/api2/`
- Endpoints used:
  - `/observations/{id}` for observation details
  - `/sequences/{id}` for DNA sequence data
- Authentication via API key (stored in `MUSHROOM_OBSERVER_API_KEY`)

#### Key Data Fields
- `scientific_name`: Taxonomic identification
- `observer`: User who made observation  
- `observed_on`: Date of observation
- `dna_barcode`: DNA sequence data
- `sequence_notes`: Additional sequence information

### MyCoPortal Integration

#### Data Synchronization  
**Endpoint:** `POST /api/mycoportal/sync/:observationId`

**API Integration:**
- Portal-specific API endpoints
- Specimen catalog number based lookups
- Institution and collection code tracking

#### Key Data Fields
- `catalog_number`: Specimen catalog identifier
- `scientific_name`: Taxonomic identification
- `recorded_by`: Collector information
- `event_date`: Collection date
- `state_province`: Geographic location

## File Management System

### BLAST File Downloads
**Process:**
1. Parse MycoMap BLAST URL to extract file download links
2. Download both NCBI and local BLAST result files
3. Store files in `/downloads/blast/` directory
4. Update database with file paths and download status

**File Naming Convention:**
- NCBI file: `{observationId}_ncbi_blast.txt`
- Local file: `{observationId}_local_blast.txt`

### Trace File Downloads
**Process:**
1. Parse MycoMap trace URL to find FASTQ file links
2. Download sequence trace files
3. Store in `/downloads/trace/` directory
4. Update database with file path and download status

**File Naming Convention:**
- FASTQ file: `{observationId}_trace.fastq`

### API Response Storage
Each platform's complete API response is stored as JSON files:
- iNaturalist: `/downloads/inat_api/{observationId}_inat_api.json`
- Mushroom Observer: `/downloads/mo_api/{observationId}_mo_api.json`  
- MyCoPortal: `/downloads/mycoportal_api/{observationId}_mycoportal_api.json`

## UI Components & Interaction

### Filter Controls
```typescript
// Source filter dropdown
<Select value={sourceFilter} onValueChange={setSourceFilter}>
  <SelectItem value="all">All Sources</SelectItem>
  <SelectItem value="inaturalist">iNaturalist</SelectItem>
  <SelectItem value="mo">Mushroom Observer</SelectItem>
  <SelectItem value="mycoportal">MyCoPortal</SelectItem>
</Select>

// Sync status filter
<Select value={syncFilter} onValueChange={setSyncFilter}>
  <SelectItem value="all">All Status</SelectItem>
  <SelectItem value="synced">Synced</SelectItem>
  <SelectItem value="not_synced">Not Synced</SelectItem>
</Select>

// Validation status filter  
<Select value={validationFilter} onValueChange={setValidationFilter}>
  <SelectItem value="all">All Records</SelectItem>
  <SelectItem value="validated">Validated</SelectItem>
  <SelectItem value="incomplete">Incomplete</SelectItem>
</Select>
```

### Record Display Logic
Each observation record displays:
1. **Primary Information:** Scientific name, common name, observation ID, source
2. **Validation Badges:** Overall validation status with color coding
3. **Expandable Details:** Data comparison tables and sync actions
4. **Individual Field Comparisons:** Side-by-side MycoMap vs external platform data
5. **Action Buttons:** Sync individual records, download files, view external links

### Status Badge Color Coding
- **Green**: Fully validated (all criteria met)
- **Yellow**: Incomplete validation (missing data or files)
- **Red**: Validation errors or sync failures
- **Gray**: No external platform data available

### Real-Time Updates
- Progress tracking during bulk sync operations
- Automatic cache invalidation after sync completion
- Live status updates using React Query polling (2-second intervals)

## Error Handling & Edge Cases

### API Rate Limiting
- iNaturalist: 60 requests/minute limit enforced with 1.1-second delays
- Mushroom Observer: API key required, rate limits handled by external service
- MyCoPortal: Portal-specific rate limiting considerations

### Data Validation Edge Cases
1. **Missing External Data:** Validation passes if no external platform data exists
2. **Partial Date Matches:** Multiple date format normalization attempts
3. **Empty Field Handling:** Empty strings treated as missing data
4. **Case Sensitivity:** All text comparisons are case-insensitive
5. **Whitespace Handling:** All comparisons use trimmed values

### Sync Failure Recovery
- Individual record failures don't stop bulk operations
- Error messages stored and displayed in progress tracking
- Retry mechanisms for temporary network failures
- Manual re-sync options for failed records

## Performance Considerations

### Database Optimization
- Indexed columns for observation_id lookups across all tables
- Complex JOIN queries optimized with proper WHERE clause ordering
- Result limiting to prevent large data transfers

### Frontend Optimization
- React Query caching with 30-second stale time
- Lazy loading of expanded record details
- Debounced search input handling
- Pagination support for large result sets

### Memory Management
- Streaming file downloads for large BLAST/trace files
- Chunked API response processing
- Automatic cleanup of temporary files

This documentation provides the complete technical specification needed to recreate the Admin Validation page functionality, including all platform-specific integration details, validation logic chains, and implementation patterns.