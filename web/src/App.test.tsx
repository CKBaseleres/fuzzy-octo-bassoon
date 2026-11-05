import { screen } from '@testing-library/react';
import { App } from './App';
import { mockApi } from './test/mockApi';
import { renderWithProviders } from './test/render';

describe('App shell', () => {
  it('shows the API health reported by GET /api/health', async () => {
    mockApi.health({ status: 'ok', time: '2026-11-05T09:30:00.000Z' });

    renderWithProviders(<App />);

    expect(await screen.findByText('API status: ok')).toBeInTheDocument();
  });

  it('says the API is unreachable when the health check fails', async () => {
    mockApi.healthFails(503);

    renderWithProviders(<App />);

    expect(await screen.findByText('API status: unreachable')).toBeInTheDocument();
  });
});
