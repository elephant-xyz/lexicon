# Testing Documentation

## Overview

This project uses **Vitest** with **React Testing Library** for comprehensive testing. Tests are organized in a separate `/tests` directory to keep them isolated from the main application code.

## Test Structure

```
tests/
├── setup.ts              # Global test setup and mocks
├── mockData.ts           # Shared mock data for tests
├── services/             # Service layer tests
│   └── dataService.test.ts
├── components/           # Component tests
│   ├── LexiconClassViewer.test.tsx
│   └── NavigationHeader.test.tsx
└── pages/               # Page component tests
    ├── AllClassesViewer.test.tsx
    └── SingleClassViewer.test.tsx
```

## Available Scripts

- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:watch` - Run tests in watch mode (explicit)

## Test Categories

### Service Tests (`dataService.test.ts`)
- ✅ **Fully Working** - Comprehensive coverage of data filtering, search, and retrieval
- Tests all public methods with various edge cases
- Mocks the lexicon.json data for reliable testing
- Covers fuzzy search, filtering, and data group handling

### Component Tests
- 🔄 **In Progress** - Some tests implemented but need Router mocking fixes
- Tests basic rendering, props, user interactions
- Uses React Testing Library for realistic user behavior testing
- Mocks external dependencies and browser APIs

## Current Test Coverage

The working dataService tests provide:
- **91.78%** statement coverage
- **85.1%** branch coverage  
- **100%** function coverage

## Testing Patterns

### Mock Data
Shared mock data in `tests/mockData.ts` provides:
- `mockLexiconClass` - Basic class structure
- `mockDeprecatedClass` - Class with deprecated properties
- `mockSearchResultClass` - Class with search matches
- `mockLexiconClasses` - Array of test classes

### Browser API Mocks
Global mocks in `tests/setup.ts`:
- `sessionStorage` / `localStorage`
- `navigator.clipboard`
- `window.scrollTo`
- `IntersectionObserver` / `ResizeObserver`
- React Router history/location APIs

### Component Testing Patterns
```typescript
// Render with Router context
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

// Test user interactions
fireEvent.click(screen.getByRole('button', { name: /expand/i }));
await waitFor(() => {
  expect(screen.getByText('Properties:')).toBeInTheDocument();
});
```

## GitHub Actions Integration

The CI pipeline runs:
1. **Lint and Format** - ESLint + Prettier checks
2. **Tests with Coverage** - Vitest with v8 coverage
3. **Build** - TypeScript compilation and Vite build

Coverage reports are uploaded as artifacts and can integrate with Codecov.

## Future Improvements

1. **Fix Router Mocking** - Resolve React Router v7 compatibility issues
2. **Integration Tests** - Add end-to-end testing with Playwright
3. **Visual Testing** - Add component snapshot tests
4. **Performance Testing** - Add tests for large dataset handling
5. **Accessibility Testing** - Add automated a11y checks

## Running Tests Locally

```bash
# Install dependencies
npm install

# Run all working tests
npm run test:run -- tests/services/

# Run with coverage
npm run test:coverage -- tests/services/

# Start test UI
npm run test:ui
```

## Debugging Tests

- Use `console.log` within tests for debugging
- Use `screen.debug()` to see rendered DOM
- Use `--no-coverage` flag to improve performance during development
- Use `--reporter=verbose` for detailed test output