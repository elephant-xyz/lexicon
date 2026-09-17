import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PublishedCatalogViewer from '../../src/PublishedCatalogViewer';
import { CatalogNotConfiguredError, getManifest } from '../../src/services/ipfsCatalog';

vi.mock('../../src/services/ipfsCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/ipfsCatalog')>(
    '../../src/services/ipfsCatalog'
  );
  return { ...actual, getManifest: vi.fn() };
});

function renderCatalog() {
  return render(
    <MemoryRouter>
      <PublishedCatalogViewer />
    </MemoryRouter>
  );
}

describe('PublishedCatalogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tells the operator the catalog pointer is missing rather than offering a retry', async () => {
    vi.mocked(getManifest).mockRejectedValue(
      new CatalogNotConfiguredError('No published catalog pointer is configured.')
    );

    renderCatalog();

    expect(await screen.findByText('No published catalog is configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use Legacy' })).toBeInTheDocument();
  });

  it('keeps the recoverable retry path for a transient catalog failure', async () => {
    vi.mocked(getManifest).mockRejectedValue(new Error('Published manifest returned 502.'));

    renderCatalog();

    expect(await screen.findByText('The catalog didn’t load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('lists published definitions once the catalog resolves', async () => {
    vi.mocked(getManifest).mockResolvedValue({
      County: { ipfsCid: 'bafy-county', type: 'dataGroup' },
      property: { ipfsCid: 'bafy-property', type: 'class' },
    });

    renderCatalog();

    expect(await screen.findByText('County')).toBeInTheDocument();
    expect(screen.getByText('2 definitions')).toBeInTheDocument();
  });
});
