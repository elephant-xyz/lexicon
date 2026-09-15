import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PublishedSchemaViewer from '../../src/PublishedSchemaViewer';
import { getJsonByCid, getManifest } from '../../src/services/ipfsCatalog';

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

  it('reports the failure once the retries are spent', { timeout: 25000 }, async () => {
    vi.mocked(getJsonByCid).mockRejectedValue(
      new Error('CID bafy-inspection could not be resolved.')
    );

    renderViewer();

    expect(
      await screen.findByText('Published schema unavailable', undefined, { timeout: 12000 })
    ).toBeInTheDocument();
    expect(getJsonByCid).toHaveBeenCalledTimes(3);
  });
});
