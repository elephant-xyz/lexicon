import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PublishedSchemaViewer from '../../src/PublishedSchemaViewer';
import {
  CatalogNotConfiguredError,
  getJsonByCid,
  getManifest,
} from '../../src/services/ipfsCatalog';

vi.mock('../../src/services/ipfsCatalog', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/ipfsCatalog')>(
    '../../src/services/ipfsCatalog'
  );
  return { ...actual, getManifest: vi.fn(), getJsonByCid: vi.fn() };
});

const manifest = { inspection: { ipfsCid: 'bafy-inspection', type: 'class' as const } };
const schema = { title: 'inspection', type: 'object', properties: {} };

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={['/schema/inspection']}>
      <Routes>
        <Route path="/schema/:schemaName" element={<PublishedSchemaViewer />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublishedSchemaViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getManifest).mockResolvedValue(manifest);
  });

  it('retries a cold CID instead of surfacing the first failure', { timeout: 15000 }, async () => {
    vi.mocked(getJsonByCid)
      .mockRejectedValueOnce(new Error('CID bafy-inspection could not be resolved.'))
      .mockResolvedValueOnce(schema);

    renderViewer();

    expect(
      await screen.findByRole('heading', { name: 'inspection' }, { timeout: 6000 })
    ).toBeInTheDocument();
    expect(getJsonByCid).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Published schema unavailable')).not.toBeInTheDocument();
  });

  it('explains the failure plainly once the retries are spent', { timeout: 25000 }, async () => {
    vi.mocked(getJsonByCid).mockRejectedValue(
      new Error('CID bafy-inspection could not be resolved. same-origin reader: 502')
    );

    renderViewer();

    expect(
      await screen.findByText('This schema didn’t load', undefined, { timeout: 12000 })
    ).toBeInTheDocument();
    expect(getJsonByCid).toHaveBeenCalledTimes(3);
    // The raw gateway text stays available, but behind a disclosure.
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('names the missing catalog pointer instead of retrying', async () => {
    vi.mocked(getManifest).mockRejectedValue(
      new CatalogNotConfiguredError('No published catalog pointer is configured.')
    );

    renderViewer();

    expect(await screen.findByText('No published catalog is configured')).toBeInTheDocument();
    expect(getJsonByCid).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it(
    'reloads the schema when the reader recovers and the user retries',
    { timeout: 25000 },
    async () => {
      vi.mocked(getJsonByCid).mockRejectedValue(
        new Error('CID bafy-inspection could not be resolved.')
      );

      renderViewer();
      const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 12000 });

      vi.mocked(getJsonByCid).mockResolvedValue(schema);
      await userEvent.click(retry);

      expect(await screen.findByRole('heading', { name: 'inspection' })).toBeInTheDocument();
      expect(screen.queryByText('This schema didn’t load')).not.toBeInTheDocument();
    }
  );
});
