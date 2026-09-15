import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import App from '../src/App';

vi.mock('../src/PublishedCatalogViewer', () => ({
  default: () => <div>Published IPFS catalog</div>,
}));
vi.mock('../src/PublishedSchemaViewer', () => ({
  default: () => <div>Published IPFS schema</div>,
}));
vi.mock('../src/AllClassesViewer', () => ({
  default: () => <div>Git working copy catalog</div>,
}));
vi.mock('../src/SingleClassViewer', () => ({
  default: () => <div>Git working copy class</div>,
}));
vi.mock('../src/HTMLViewer', () => ({ default: () => null }));
vi.mock('../src/LanguageHTMLViewer', () => ({ default: () => null }));
vi.mock('../src/CustomerAPIHTMLViewer', () => ({ default: () => null }));

describe('lexicon source routing', () => {
  it('uses the published IPFS catalog at the default route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Published IPFS catalog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Published' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('Git working copy catalog')).not.toBeInTheDocument();
  });

  it('keeps the repository-backed explorer under Legacy', () => {
    render(
      <MemoryRouter initialEntries={['/legacy']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Git working copy catalog')).toBeInTheDocument();
    expect(screen.getByText('Legacy working copy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Legacy' })).toHaveAttribute('aria-current', 'page');
  });
});
