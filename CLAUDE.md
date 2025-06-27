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