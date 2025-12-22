/**
 * Location Normalization Service
 * 
 * Uses iNaturalist's structured place_ids instead of parsing place_guess text
 * to reliably extract state/province and country information.
 */

// US States lookup - abbreviation to full name
export const US_STATES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
  'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam',
  'AS': 'American Samoa', 'MP': 'Northern Mariana Islands'
};

// Reverse lookup - full name to abbreviation
export const US_STATES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

// Canadian Provinces lookup
export const CA_PROVINCES: Record<string, string> = {
  'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba',
  'NB': 'New Brunswick', 'NL': 'Newfoundland and Labrador',
  'NS': 'Nova Scotia', 'NT': 'Northwest Territories', 'NU': 'Nunavut',
  'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec',
  'SK': 'Saskatchewan', 'YT': 'Yukon'
};

// Reverse lookup for Canadian provinces
export const CA_PROVINCES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(CA_PROVINCES).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

// Country codes (ISO 3166-1 alpha-2) for common countries
export const COUNTRIES: Record<string, string> = {
  'US': 'United States', 'CA': 'Canada', 'MX': 'Mexico',
  'GB': 'United Kingdom', 'AU': 'Australia', 'NZ': 'New Zealand',
  'DE': 'Germany', 'FR': 'France', 'ES': 'Spain', 'IT': 'Italy',
  'JP': 'Japan', 'CN': 'China', 'IN': 'India', 'BR': 'Brazil',
  'AR': 'Argentina', 'CL': 'Chile', 'CO': 'Colombia', 'PE': 'Peru',
  'ZA': 'South Africa', 'KE': 'Kenya', 'NG': 'Nigeria',
  'SE': 'Sweden', 'NO': 'Norway', 'FI': 'Finland', 'DK': 'Denmark',
  'NL': 'Netherlands', 'BE': 'Belgium', 'CH': 'Switzerland', 'AT': 'Austria',
  'PL': 'Poland', 'CZ': 'Czech Republic', 'HU': 'Hungary', 'RO': 'Romania',
  'GR': 'Greece', 'PT': 'Portugal', 'IE': 'Ireland', 'RU': 'Russia',
  'UA': 'Ukraine', 'TR': 'Turkey', 'IL': 'Israel', 'EG': 'Egypt',
  'TH': 'Thailand', 'VN': 'Vietnam', 'PH': 'Philippines', 'ID': 'Indonesia',
  'MY': 'Malaysia', 'SG': 'Singapore', 'KR': 'South Korea', 'TW': 'Taiwan',
  'CR': 'Costa Rica', 'PA': 'Panama', 'EC': 'Ecuador', 'VE': 'Venezuela'
};

// Reverse lookup for countries
export const COUNTRIES_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRIES).map(([code, name]) => [name.toLowerCase(), code])
);

// iNaturalist place types and admin levels
// See: https://www.inaturalist.org/pages/place_guide
// Admin levels: 0=Country, 10=State/Province, 20=County, 30=City
export const PLACE_TYPES = {
  COUNTRY: 12,      // place_type for countries
  STATE: 8,         // place_type for states/provinces
  COUNTY: 9,        // place_type for counties
  OPEN_SPACE: 100,  // Parks, reserves, etc.
};

// Admin level constants (iNaturalist uses these for administrative hierarchy)
export const ADMIN_LEVELS = {
  COUNTRY: 0,       // Nation level
  STATE: 10,        // State/Province level
  COUNTY: 20,       // County/District level
  CITY: 30,         // City/Town level
};

// Cache for place lookups
const placeCache: Map<number, PlaceRecord> = new Map();

export interface PlaceRecord {
  id: number;
  name: string;
  display_name: string;
  place_type: number;
  admin_level: number | null;
  ancestor_place_ids: number[];
  code?: string;  // ISO code if available
}

export interface NormalizedLocation {
  stateCode: string | null;
  stateName: string | null;
  countryCode: string | null;
  countryName: string | null;
  confidence: 'exact' | 'fallback';
  rawPlaceGuess?: string;
}

/**
 * Fetch place records from iNaturalist API
 */
export async function fetchPlaces(placeIds: number[]): Promise<PlaceRecord[]> {
  if (placeIds.length === 0) return [];
  
  // Check cache first
  const uncachedIds = placeIds.filter(id => !placeCache.has(id));
  
  if (uncachedIds.length > 0) {
    try {
      // Batch request (max 30 at a time per iNat API limits)
      const batches = [];
      for (let i = 0; i < uncachedIds.length; i += 30) {
        batches.push(uncachedIds.slice(i, i + 30));
      }
      
      for (const batch of batches) {
        const response = await fetch(
          `https://api.inaturalist.org/v1/places/${batch.join(',')}`,
          { headers: { 'Accept': 'application/json' } }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.results) {
            for (const place of data.results) {
              const record: PlaceRecord = {
                id: place.id,
                name: place.name,
                display_name: place.display_name || place.name,
                place_type: place.place_type,
                admin_level: place.admin_level,
                ancestor_place_ids: place.ancestor_place_ids || [],
                code: place.code
              };
              placeCache.set(place.id, record);
            }
          }
        }
        
        // Rate limiting - small delay between batches
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error('Error fetching places from iNaturalist:', error);
    }
  }
  
  // Return all requested places from cache
  return placeIds
    .map(id => placeCache.get(id))
    .filter((p): p is PlaceRecord => p !== undefined);
}

/**
 * Normalize a state name to code and full name
 */
export function normalizeState(input: string): { code: string; name: string } | null {
  if (!input) return null;
  
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  
  // Check if it's a US state abbreviation
  if (US_STATES[upper]) {
    return { code: upper, name: US_STATES[upper] };
  }
  
  // Check if it's a US state full name
  if (US_STATES_REVERSE[lower]) {
    return { code: US_STATES_REVERSE[lower], name: trimmed };
  }
  
  // Check if it's a Canadian province abbreviation
  if (CA_PROVINCES[upper]) {
    return { code: upper, name: CA_PROVINCES[upper] };
  }
  
  // Check if it's a Canadian province full name
  if (CA_PROVINCES_REVERSE[lower]) {
    return { code: CA_PROVINCES_REVERSE[lower], name: trimmed };
  }
  
  // Return as-is if not recognized (for international locations)
  return { code: trimmed, name: trimmed };
}

/**
 * Normalize a country name to code and full name
 */
export function normalizeCountry(input: string): { code: string; name: string } | null {
  if (!input) return null;
  
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  
  // Check if it's a country code
  if (COUNTRIES[upper]) {
    return { code: upper, name: COUNTRIES[upper] };
  }
  
  // Check if it's a country full name
  if (COUNTRIES_REVERSE[lower]) {
    return { code: COUNTRIES_REVERSE[lower], name: trimmed };
  }
  
  // Handle common variations
  if (lower === 'usa' || lower === 'united states of america') {
    return { code: 'US', name: 'United States' };
  }
  if (lower === 'uk' || lower === 'great britain' || lower === 'england') {
    return { code: 'GB', name: 'United Kingdom' };
  }
  
  // Return as-is if not recognized
  return { code: trimmed, name: trimmed };
}

/**
 * Extract normalized location from an iNaturalist observation
 * Uses structured place_ids instead of parsing place_guess
 */
export async function extractLocationFromObservation(
  observation: any
): Promise<NormalizedLocation> {
  const result: NormalizedLocation = {
    stateCode: null,
    stateName: null,
    countryCode: null,
    countryName: null,
    confidence: 'fallback',
    rawPlaceGuess: observation.place_guess
  };
  
  // Try to use structured place_ids first
  const placeIds = observation.place_ids || [];
  
  if (placeIds.length > 0) {
    const places = await fetchPlaces(placeIds);
    
    // Find country (admin_level 0 or place_type 12)
    // iNaturalist admin_level 0 = Country
    const country = places.find(p => 
      p.admin_level === ADMIN_LEVELS.COUNTRY || p.place_type === PLACE_TYPES.COUNTRY
    );
    
    // Find state/province (admin_level 10 or place_type 8)
    // iNaturalist admin_level 10 = State/Province
    const state = places.find(p => 
      p.admin_level === ADMIN_LEVELS.STATE || p.place_type === PLACE_TYPES.STATE
    );
    
    if (country) {
      // Use the ISO code from the API if available, otherwise normalize the name
      if (country.code && country.code.length === 2) {
        result.countryCode = country.code.toUpperCase();
        result.countryName = COUNTRIES[result.countryCode] || country.name;
        result.confidence = 'exact';
      } else {
        const normalized = normalizeCountry(country.name);
        if (normalized) {
          result.countryCode = normalized.code;
          result.countryName = normalized.name;
          result.confidence = 'exact';
        }
      }
    }
    
    if (state) {
      // Use the ISO code from the API if available (e.g., "US-MI" for Michigan)
      if (state.code) {
        // ISO 3166-2 codes are formatted like "US-MI", extract just the state part
        const codeParts = state.code.split('-');
        const stateCode = codeParts.length > 1 ? codeParts[1] : state.code;
        result.stateCode = stateCode.toUpperCase();
        // Look up the full name from our lookup tables
        result.stateName = US_STATES[result.stateCode] || CA_PROVINCES[result.stateCode] || state.name;
        result.confidence = 'exact';
      } else {
        const normalized = normalizeState(state.name);
        if (normalized) {
          result.stateCode = normalized.code;
          result.stateName = normalized.name;
          result.confidence = 'exact';
        }
      }
    }
  }
  
  // Fallback: try to parse place_guess if structured data didn't work
  if (result.confidence === 'fallback' && observation.place_guess) {
    const parsed = parseLocationFallback(observation.place_guess);
    if (parsed.state) {
      const normalized = normalizeState(parsed.state);
      if (normalized) {
        result.stateCode = normalized.code;
        result.stateName = normalized.name;
      }
    }
    if (parsed.country) {
      const normalized = normalizeCountry(parsed.country);
      if (normalized) {
        result.countryCode = normalized.code;
        result.countryName = normalized.name;
      }
    }
  }
  
  return result;
}

/**
 * Fallback parser for place_guess when structured data isn't available
 * This is a best-effort parser and may not be accurate
 */
function parseLocationFallback(placeGuess: string): { state: string | null; country: string | null } {
  if (!placeGuess) return { state: null, country: null };
  
  // Split by comma and clean up
  const parts = placeGuess.split(',').map(p => p.trim()).filter(p => p.length > 0);
  
  if (parts.length === 0) return { state: null, country: null };
  
  let state: string | null = null;
  let country: string | null = null;
  
  // Work backwards from the end (usually country, then state)
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    
    // Skip parts that look like zip codes
    if (/^\d{5}(-\d{4})?$/.test(part)) continue;
    
    // Skip parts that are too long (likely detailed location names)
    if (part.length > 50) continue;
    
    // Try to identify as country
    if (!country) {
      const normalizedCountry = normalizeCountry(part);
      if (normalizedCountry && COUNTRIES[normalizedCountry.code]) {
        country = normalizedCountry.name;
        continue;
      }
    }
    
    // Try to identify as state (check for state abbreviation pattern like "MI 49738")
    if (!state) {
      // Extract just the state code if there's a zip attached
      const stateMatch = part.match(/^([A-Z]{2})\s*\d{5}/);
      if (stateMatch) {
        const normalized = normalizeState(stateMatch[1]);
        if (normalized) {
          state = normalized.name;
          continue;
        }
      }
      
      // Otherwise try the whole part
      const normalizedState = normalizeState(part);
      if (normalizedState && (US_STATES[normalizedState.code] || CA_PROVINCES[normalizedState.code])) {
        state = normalizedState.name;
        continue;
      }
    }
  }
  
  return { state, country };
}

/**
 * Clear the place cache (useful for testing or memory management)
 */
export function clearPlaceCache(): void {
  placeCache.clear();
}

/**
 * Get cache statistics
 */
export function getPlaceCacheStats(): { size: number } {
  return { size: placeCache.size };
}
