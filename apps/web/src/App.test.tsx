// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';
import './i18n';

describe('web app', () => {
  it('renders landing page when logged out', async () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/وارهيكس/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/ابدأ الآن/i)).toBeInTheDocument();
  });
});
