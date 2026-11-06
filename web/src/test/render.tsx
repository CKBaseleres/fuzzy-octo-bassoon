import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Renders inside the same providers as `main.tsx`. */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>, options);
}
