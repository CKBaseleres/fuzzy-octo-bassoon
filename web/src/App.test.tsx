import { screen } from '@testing-library/react';
import { App } from './App';
import { mockApi } from './test/mockApi';
import { renderWithProviders } from './test/render';

describe('App shell', () => {
  it('opens on the Translation screen', async () => {
    mockApi.languages([{ code: 'fr', name: 'French' }]);

    renderWithProviders(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Lingo Lens' })).toBeInTheDocument();
    expect(screen.getByLabelText('File to translate')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'French' })).toBeInTheDocument();
  });
});
