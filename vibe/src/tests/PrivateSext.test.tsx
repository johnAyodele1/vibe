import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PrivateSext from '../components/AdultZone/PrivateSext';

// Mock AdultAuthContext using relative path from test file
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'user123', email: 'user@test.com', credits: 500, role: 'user' }
  })
}));

describe('PrivateSext Frontend Component', () => {
  it('renders standard empty state correctly', async () => {
    render(<PrivateSext />);
    await waitFor(() => {
      expect(screen.getByText(/Sexting Inbox/i)).toBeInTheDocument();
      expect(screen.getByText(/Choose an ongoing conversation from the sidebar/i)).toBeInTheDocument();
    });
  });
});
