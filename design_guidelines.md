# MycoMap.org Design Guidelines

## Design Approach
**Reference-Based**: Drawing from iNaturalist's community science UX + National Geographic's nature photography treatment + academic platforms like JSTOR for data credibility. Balance accessibility with scientific rigor through clean typography and natural imagery.

## Typography System
**Primary**: Inter (Google Fonts) - clean, scientific, excellent readability
**Accent**: Crimson Pro - for article headlines and scientific names, adds warmth
**Hierarchy**:
- Hero headlines: 3xl to 6xl, font-weight 700
- Section headers: 2xl to 4xl, font-weight 600
- Body text: base to lg, font-weight 400
- Scientific names: Italic, text-sm uppercase tracking-wide for labels

## Layout & Spacing
**Tailwind primitives**: Consistently use 4, 6, 8, 12, 16, 20, 24, 32 spacing units
**Container structure**: max-w-7xl for standard sections, max-w-6xl for reading content
**Vertical rhythm**: py-16 mobile, py-24 desktop for major sections

## Homepage Structure

**Hero Section** (90vh)
Full-width immersive forest floor/mushroom photography with subtle overlay gradient (dark-to-transparent from bottom). Centered content with large headline, descriptive subhead, dual CTAs (primary: "Explore Projects", secondary: "Join Community"). Buttons use backdrop-blur-md with bg-white/20 borders.

**Mission Statement** (2-column desktop, stacked mobile)
Left: Compelling mission text with max-w-prose
Right: Stat cards grid showing active researchers, sequenced specimens, certified habitats

**Featured Projects** (3-column grid)
Card design with mushroom species photography, project name, participant count, and "Learn More" link. Hover lift effect (translate-y-1).

**How It Works** (Timeline/Process flow)
Horizontal step indicators with icons: Observe → Document → Sequence → Contribute. Each step includes brief description and supporting imagery.

**Community Highlights** (Masonry grid or 2x2)
Recent discoveries, featured contributors, latest blog posts with thumbnail images

**Research Impact** (Full-width with background texture)
Data visualization preview, publication metrics, partnership logos

**CTA Footer Section**
Split layout: Newsletter signup form left, Quick start guide/resources right

## Project Pages Layout
**Hero**: Specific project imagery (MycoBlitz event photos, lab sequencing, habitat certification), project logo overlay
**Overview**: Single column max-w-4xl with rich text, embedded media
**Participation Section**: Step-by-step cards with icons and clear CTAs
**Gallery**: 3-4 column responsive grid of community contributions
**Impact Metrics**: Dashboard-style stat displays

## Research Dashboard
**Data-dense focused design**:
- Sidebar navigation (fixed, 240px wide)
- Main content area with filter toolbar
- Card-based data displays with charts/graphs
- Table views with sorting, pagination
- Export functionality prominently placed
- Use subtle grid backgrounds (bg-gray-50) to separate data sections

## User Account Pages
**Profile Header**: Avatar, username, contribution stats, badges
**Activity Feed**: Timeline of contributions, chronological cards
**Settings**: Form-heavy with clear section divisions
**My Collections**: Grid view of specimens/observations with metadata

## Component Library

**Navigation**: Sticky header, white background with subtle shadow, logo left, main nav center, account/CTA right, mobile hamburger
**Cards**: Rounded-lg, shadow-sm, hover:shadow-md transitions, image-top or image-left variants
**Buttons**: Rounded-full primary (green), secondary (brown), outline variants
**Forms**: Rounded-lg inputs, focus:ring-2 ring-green, clear labels above inputs
**Data Tables**: Striped rows, sticky headers, responsive scroll
**Modals**: Centered, max-w-2xl, backdrop-blur overlay
**Tags/Badges**: Rounded-full, small text, category colors
**Search**: Prominent with autocomplete dropdown

## Images

**Homepage Hero**: Macro photography of mushroom emerging from forest floor with morning light, dew drops, moss - conveys discovery and natural beauty (full-width, 90vh)

**Project Cards**: Species-specific mushroom photography, field research photos, lab work images (400x300px aspect ratio)

**Mission Section**: Wide-angle forest canopy or mycelium network microscopy as subtle background

**Community Highlights**: User-submitted mushroom finds, people in field collecting specimens, research team photos (various sizes in masonry)

**Research Dashboard**: No decorative images - focus on data visualizations, charts, graphs

**About/Team pages**: Environmental portraits of researchers in field settings, lab settings

## Accessibility & UX
- Maintain 4.5:1 contrast ratios minimum
- Focus indicators visible on all interactive elements
- Skip navigation links
- Semantic HTML structure for screen readers
- Form validation with clear error messaging
- Loading states for data-heavy sections
- Breadcrumb navigation on deep pages

## Animations
Minimal, purposeful only:
- Page transitions: Fade-in
- Card hovers: Subtle lift (2-4px translate)
- Button states: Scale 0.98 on active
- Data updates: Smooth number counting
- Image loading: Blur-up technique