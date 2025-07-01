# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This project uses **Vite** (migrated from Create React App) with TypeScript:

- `npm start` or `npm run dev`: Start development server on http://localhost:3000
- `npm run build`: TypeScript compilation + production build to `/dist`
- `npm run test:coverage`: Run tests with coverage report
- `npm run preview`: Preview production build locally
- `npm test`: Run tests with Vitest

**Important**: The project was recently migrated from react-scripts to Vite. The README.md still references the old Create React App commands, but package.json contains the correct Vite commands.

## Architecture Overview

**Elephant Lexicon** is a React+TypeScript schema viewer for displaying lexicon data. The app provides search and browse functionality for structured schema definitions.

### Core Architecture

```
Data Flow: lexicon.json → dataService → Route Components → LexiconClassViewer
Navigation: AllClassesViewer ↔ SingleClassViewer (via relationship links)
```

**Key Pattern**: Route components follow consistent patterns:
1. Extract URL parameters via `useParams`
2. Call appropriate `dataService` method for filtered data
3. Apply search filtering via `dataService.filterClassesForSearch`
4. Render via shared `LexiconClassViewer` component

**Navigation System**: Added comprehensive navigation between classes:
- **Clickable Relationship Targets**: Relationship targets are now interactive buttons that navigate to individual class views
- **Browser History Integration**: Full back/forward button support with session storage tracking
- **Individual Class Views**: Dedicated routes for viewing single classes (`/class/:className`)
- **Navigation Controls**: Back, Forward, and Home buttons with proper state management

### Routing Structure

The app uses hierarchical URL-based filtering and individual class navigation:
- `/` → `AllClassesViewer` (main landing page with all classes)
- `/class/:className` → `SingleClassViewer` (individual class view)
- `/:language_name` → `LanguageHTMLViewer`
- `/:language_name/:product_api_identifier/:schema_type` → `HTMLViewer`  
- `/:language_name/:product_api_identifier/:schema_type/:output_language` → `CustomerAPIHTMLViewer`

Route order matters in React Router v7 - most specific routes are listed first in App.tsx.

**Navigation Flow**:
1. Users start at `AllClassesViewer` with category filtering and search
2. Click relationship targets to navigate to `SingleClassViewer` for specific classes
3. Use Back/Forward buttons for browser-style navigation
4. Home button returns to main view

### Data Source

- **Source**: `src/data/lexicon.json` (784KB, contains real estate/education domain schemas)
- **Access**: Via `dataService.ts` singleton with filtering methods
- **Structure**: Array of `LexiconClass` objects with properties and relationships
- **Important**: Deprecated properties are filtered out during rendering

### Component Architecture

**Shared Component**: `LexiconClassViewer` handles the display logic for all lexicon classes:
- Renders class metadata (type, container_name, deprecation status)
- Displays non-deprecated properties with type information and enums
- Shows relationships with target information
- All styling via CSS classes (not inline styles)

**Route Components**: Thin wrappers that handle URL parameters and data filtering, then delegate to `LexiconClassViewer`.

### Service Layer

`dataService.ts` provides filtered access to lexicon data:
- **Filtering Methods**: Filter by language, schema type, product API identifier
- **Search**: Multi-field text search across type, container, properties, and relationships
- **Individual Class Access**: `getClassByName(className)` method for single class retrieval
- **Pattern**: Singleton service instantiated as default export

## Technology Stack

- **React 18.2** with TypeScript 5.8.3 (ES2024 target)
- **React Router DOM 7.6.2** (uses `Routes`/`Route`, not `Switch`)
- **Vite 7.0.0** for build/dev server
- **CSS**: Traditional CSS files with CSS custom properties
- **Testing**: Vitest + React Testing Library

## TypeScript Configuration

- **Target**: ES2024 with ES2022 modules (latest standards)
- **Strict mode**: Enabled
- **Module resolution**: Bundler (optimized for Vite)
- **allowJs**: true (supports mixed JS/TS during migration)

## Key Files

- `src/services/dataService.ts`: Data access layer with filtering logic and individual class retrieval
- `src/types/lexicon.ts`: TypeScript interfaces for lexicon data structure
- `src/components/LexiconClassViewer.tsx`: Shared rendering component with clickable relationship targets
- `src/AllClassesViewer.tsx`: Main landing page with category filtering and search
- `src/SingleClassViewer.tsx`: Individual class view with navigation controls and scroll-to-top
- `src/App.tsx`: Router configuration with individual class routes
- `src/data/lexicon.json`: Static lexicon data (large file - 16,922 lines)
- `src/styles.css`: Comprehensive CSS with navigation and scroll-to-top button styles
- `vite.config.ts`: Vite configuration with React plugin and path aliases

## Development Notes

**Performance**: The lexicon.json file is large (784KB) and loaded at startup. This is intentional for the current use case, but consider lazy loading or chunking for larger datasets.

**Search Implementation**: Real-time search updates as user types, searches across multiple fields (class type, container, property names, relationship names).

**CSS Architecture**: Uses CSS custom properties and BEM-like naming. Main styles in `src/styles.css`, with component-specific styles following CSS class patterns like `method-list-item`.

**Build Output**: Vite generates optimized bundles with asset hashing. Build warns about large chunks (>500KB) due to the lexicon data size.

## New Features and Enhancements

### Navigation System (December 2024)

**Clickable Relationship Targets**: Relationship targets in the `LexiconClassViewer` component are now interactive buttons that navigate users to individual class views. Implementation details:
- **Component**: Relationship targets rendered as `<button>` elements with `relationship-target-link` CSS class
- **Navigation**: Uses React Router's `useNavigate` hook to navigate to `/class/:className` routes
- **Styling**: Consistent blue link styling with hover effects and focus states
- **Accessibility**: Proper ARIA labels and title attributes for screen readers

**Browser History Integration**: Full browser-style navigation with session storage tracking:
- **Back/Forward Detection**: Uses `window.history.length` and session storage to track navigation state
- **Session Storage**: Maintains navigation history in `sessionStorage` under `navHistory` key
- **State Management**: React state (`canGoBack`, `canGoForward`) reflects current navigation capabilities
- **Forward Button Fix**: Implemented robust forward button detection using navigation history tracking

**Individual Class Views**: Dedicated `SingleClassViewer` component for viewing single classes:
- **Route Pattern**: `/class/:className` with URL parameter extraction via `useParams`
- **Data Access**: Uses `dataService.getClassByName(className)` for individual class retrieval
- **Error Handling**: Graceful handling of non-existent classes with user-friendly error page
- **Navigation Controls**: Back, Forward, and Home buttons with proper state management

### Scroll-to-Top Feature (December 2024)

**Floating Button**: Sticky scroll-to-top button for long content pages:
- **Trigger**: Appears when scrolled down more than 300px (past header section)
- **Position**: Fixed bottom-right corner with responsive positioning
- **Behavior**: Smooth scrolling back to top on click using `window.scrollTo({ top: 0, behavior: 'smooth' })`
- **Visibility**: Automatically hides when at top of page

**Implementation Details**:
- **Scroll Detection**: `useEffect` with scroll event listener and cleanup
- **State Management**: `showScrollToTop` React state controls button visibility
- **Styling**: Circular button with consistent design system colors and shadows
- **Responsive**: Adapts size and position for mobile devices
- **Accessibility**: Proper ARIA labels and keyboard navigation support

### Technical Implementation Notes

**Session Storage Navigation**: The forward button detection uses a custom session storage solution because React Router doesn't provide direct access to forward navigation state. The implementation:
1. Stores navigation paths in `sessionStorage.navHistory` array
2. Tracks current position in navigation history
3. Updates `canGoForward` state based on position in history array
4. Handles new page visits vs. back navigation differently

**Component Architecture**: New components follow established patterns:
- **Shared Logic**: Both `AllClassesViewer` and `SingleClassViewer` use shared `LexiconClassViewer` component
- **Navigation State**: Navigation controls implemented consistently across components
- **CSS Organization**: All new styles added to main `styles.css` following existing naming conventions
- **TypeScript**: Full type safety maintained with proper interfaces and type checking

**Performance Considerations**:
- **Scroll Listeners**: Properly cleaned up in `useEffect` to prevent memory leaks
- **Session Storage**: Minimal data stored to avoid storage bloat
- **Navigation State**: Efficient state updates without unnecessary re-renders
- **CSS Animations**: Uses CSS transitions for smooth user experience

## Testing Infrastructure (December 2024)

### Comprehensive Test Suite
**Framework**: Vitest with React Testing Library + jsdom for modern, fast testing optimized for Vite projects.

**Test Organization**: Tests are organized in separate `/tests` directory to avoid production bundle pollution:
```
/tests/
├── setup.ts                           # Global test configuration
├── services/dataService.test.ts       # Data access layer tests (27 tests)
├── components/
│   ├── LexiconClassViewer.test.tsx    # Main display component (24 tests)
│   └── NavigationHeader.test.tsx      # Navigation component (7 tests)
└── pages/
    ├── AllClassesViewer.test.tsx      # Main landing page (20 tests)
    └── SingleClassViewer.test.tsx     # Individual class view (19 tests)
```

**Test Coverage**: 
- **97 tests total** with 100% success rate
- **91.78% coverage** on dataService (core business logic)
- **69.32% overall coverage** with focus on critical functionality

**Key Testing Features**:
- **React Router v7 Compatibility**: Uses `MemoryRouter` for isolated route testing
- **Module Mocking**: Comprehensive mocking of dataService, components, and React Router hooks
- **Component Integration**: Tests user interactions, search functionality, and navigation flows
- **Error Handling**: Tests edge cases like missing classes and empty data states
- **Accessibility**: Tests proper ARIA labels, button roles, and keyboard navigation

### Test Commands
- `npm test`: Run all tests in watch mode
- `npm run test:coverage`: Generate coverage report with v8 provider
- Tests run automatically in GitHub Actions CI/CD pipeline

### Testing Patterns
**Consistent Mock Setup**: All tests follow similar patterns:
1. Mock external dependencies (dataService, React Router hooks)
2. Render components with `MemoryRouter` for isolation
3. Use `beforeEach` for clean mock state
4. Test user interactions with `fireEvent` and `waitFor`

**DOM Testing Strategy**: 
- Use `screen.getByTestId()` for reliable element selection
- Use `document.getElementById()` for elements with label associations
- Avoid text matching across split DOM nodes (use container-based assertions)

## Deployment Configuration (December 2024)

### Netlify Deployment
**Configuration**: `netlify.toml` provides comprehensive deployment settings:

**Build Settings**:
- **Command**: `npm run build` (Vite build process)
- **Publish Directory**: `build` (matches outDir in vite.config.ts)
- **Node.js Version**: 22 (latest LTS for optimal performance)

**SPA Routing**: Configured redirect rules to handle client-side routing:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Performance Optimizations**:
- **Asset Caching**: Long-term caching (1 year) for immutable assets in `/assets/*`
- **Font Optimization**: Aggressive caching for `.woff2` files
- **Image Optimization**: Optimized caching for `.jpg`, `.png`, `.svg` files
- **CSS/JS Bundling**: Enabled minification and bundling

**Security Headers**:
- **Content Security Policy**: Restricts script and style sources
- **Frame Protection**: `X-Frame-Options: DENY`
- **Content Type Protection**: `X-Content-Type-Options: nosniff`
- **Referrer Policy**: `strict-origin-when-cross-origin`

**Development Support**:
- **Deploy Previews**: Automatic builds for pull requests
- **Branch Deploys**: Automatic builds for feature branches
- **Netlify Dev**: Local development with `npm run dev` on port 3000

### CI/CD Pipeline
**GitHub Actions**: Automated testing and quality checks on every push:
- **Test Execution**: Runs full test suite with coverage reporting
- **TypeScript Checking**: Validates type safety
- **Build Verification**: Ensures production build succeeds
- **Coverage Reporting**: Tracks test coverage metrics

## Development Best Practices

### Code Quality
**TypeScript**: Strict mode enabled with ES2024 target for modern JavaScript features
**Testing**: Comprehensive test coverage with focus on user interactions and edge cases
**Performance**: Optimized bundle size with Vite's tree shaking and code splitting

### Architecture Patterns
**Component Composition**: Shared `LexiconClassViewer` component used across different views
**Service Layer**: Centralized data access through `dataService.ts` singleton
**Route-Based Architecture**: URL-driven filtering and navigation state

### Future Considerations
**Data Loading**: Consider lazy loading or chunking for larger datasets beyond 784KB
**Search Optimization**: Consider search indexing for faster query performance
**Accessibility**: Comprehensive ARIA labels and keyboard navigation support
**Mobile Optimization**: Responsive design with mobile-first CSS approach

## File Structure Reference

### Critical Configuration Files
- `vite.config.ts`: Build configuration with React plugin and path aliases
- `netlify.toml`: Deployment configuration for Netlify hosting
- `tests/setup.ts`: Global test environment configuration
- `tsconfig.json`: TypeScript compiler configuration with strict mode
- `package.json`: Dependencies and build scripts for Vite workflow

### Data and Types
- `src/data/lexicon.json`: 16,922 lines of lexicon data (784KB)
- `src/types/lexicon.ts`: TypeScript interfaces for type safety
- `src/services/dataService.ts`: Data access layer with filtering and search

### Styling
- `src/styles.css`: Comprehensive CSS with custom properties and responsive design
- CSS patterns: BEM-like naming, component-specific classes, utility classes

## JSON Schema Generation (December 2024)

### Blockchain Class Schemas
**Automatic Generation**: JSON Schemas are automatically generated for all blockchain-tagged classes during build:
- **Vite Plugin**: Custom plugin in `vite-plugins/json-schema-generator/` 
- **Build Process**: Generates schemas, canonicalizes them, and uploads to IPFS via Pinata
- **IPFS Storage**: Uses CIDv1 format for content-addressed storage
- **UI Integration**: Download links appear for blockchain classes in the viewer

**Implementation Details**:
- **Schema Generation**: All properties marked as required and nullable per requirements
- **Type Mapping**: Lexicon types mapped to JSON Schema equivalents with proper formats
- **Canonicalization**: Uses `canonicalize` library in CommonJS for deterministic output
- **IPFS Upload**: Requires `PINATA_JWT` environment variable for authentication
- **Manifest**: `public/json-schemas/schema-manifest.json` contains CID mappings

**Configuration**:
1. Set `PINATA_JWT` environment variable with your Pinata API token
2. Run `npm run build` to generate and upload schemas
3. Schemas accessible via IPFS gateway links in the UI

## SEO and Social Media Optimization (December 2024)

### Meta Tags and Open Graph
**Comprehensive SEO Setup**: Enhanced `index.html` with full SEO and social media optimization:

**Basic SEO**:
- **Title**: "Elephant Lexicon - Blockchain Schema Explorer"
- **Description**: Comprehensive description highlighting search and exploration capabilities
- **Keywords**: blockchain, lexicon, schema, data explorer, API documentation, elephant.xyz, smart contracts, web3
- **Canonical URL**: https://lexicon.elephant.xyz
- **Robots**: index, follow (search engine friendly)

**Open Graph (Facebook/LinkedIn)**:
- **Type**: website
- **Title/Description**: Optimized for social sharing
- **Image**: Uses existing Elephant.xyz favicon (framerusercontent.com hosted)
- **Site Name**: Elephant Lexicon
- **Locale**: en_US

**Twitter Cards**:
- **Card Type**: summary_large_image for better visual appeal
- **Creator/Site**: @elephant_xyz
- **Optimized titles and descriptions for Twitter's character limits

**Mobile App Integration**:
- **Apple Mobile Web App**: Configured for iOS home screen installation
- **Progressive Web App**: Mobile-friendly configuration
- **App Names**: Consistent across platforms

**Schema.org Structured Data**:
- **Type**: SoftwareApplication for better search engine understanding
- **Category**: DeveloperApplication
- **Free offering**: Price set to 0 for clear value proposition
- **Organization**: Linked to elephant.xyz for authority

### Social Sharing Benefits
**Enhanced Discoverability**:
- Rich previews when shared on social media platforms
- Improved search engine indexing and ranking
- Professional appearance in developer communities
- Clear value proposition for blockchain/web3 developers

**Technical Implementation**:
- All meta tags follow current best practices
- Uses existing Elephant.xyz brand assets for consistency
- Proper Twitter card format
- JSON-LD structured data for search engines
- Canonical URLs to prevent duplicate content issues