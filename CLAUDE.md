# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This project uses **Vite** (migrated from Create React App) with TypeScript:

- `npm start` or `npm run dev`: Start development server on http://localhost:3000
- `npm run build`: TypeScript compilation + production build to `/build`
- `npm run preview`: Preview production build locally
- `npm test`: Run tests with Vitest

**Important**: The project was recently migrated from react-scripts to Vite. The README.md still references the old Create React App commands, but package.json contains the correct Vite commands.

## Architecture Overview

**Elephant Lexicon** is a React+TypeScript schema viewer for displaying lexicon data. The app provides search and browse functionality for structured schema definitions.

### Core Architecture

```
Data Flow: lexicon.json → dataService → Route Components → LexiconClassViewer
```

**Key Pattern**: All three route components (`HTMLViewer`, `LanguageHTMLViewer`, `CustomerAPIHTMLViewer`) follow the same pattern:
1. Extract URL parameters via `useParams`
2. Call appropriate `dataService` method for filtered data
3. Apply search filtering via `dataService.filterClassesForSearch`
4. Render via shared `LexiconClassViewer` component

### Routing Structure

The app uses hierarchical URL-based filtering:
- `/:language_name` → `LanguageHTMLViewer`
- `/:language_name/:product_api_identifier/:schema_type` → `HTMLViewer`  
- `/:language_name/:product_api_identifier/:schema_type/:output_language` → `CustomerAPIHTMLViewer`

Route order matters in React Router v7 - most specific routes are listed first in App.tsx.

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

- `src/services/dataService.ts`: Data access layer with filtering logic
- `src/types/lexicon.ts`: TypeScript interfaces for lexicon data structure
- `src/components/LexiconClassViewer.tsx`: Shared rendering component
- `src/data/lexicon.json`: Static lexicon data (large file - 16,922 lines)
- `vite.config.ts`: Vite configuration with React plugin and path aliases

## Development Notes

**Performance**: The lexicon.json file is large (784KB) and loaded at startup. This is intentional for the current use case, but consider lazy loading or chunking for larger datasets.

**Search Implementation**: Real-time search updates as user types, searches across multiple fields (class type, container, property names, relationship names).

**CSS Architecture**: Uses CSS custom properties and BEM-like naming. Main styles in `src/styles.css`, with component-specific styles following CSS class patterns like `method-list-item`.

**Build Output**: Vite generates optimized bundles with asset hashing. Build warns about large chunks (>500KB) due to the lexicon data size.