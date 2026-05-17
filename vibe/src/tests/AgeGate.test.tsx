import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import AgeGate from '../components/AdultZone/AgeGate';

describe('AgeGate Component', () => {
  const onVerified = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Mock window.location.href
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  it('renders correctly', () => {
    render(<AgeGate onVerified={onVerified} />);
    expect(screen.getByText(/You are about to enter an adults-only area/i)).toBeInTheDocument();
  });

  it('requires all checkboxes to be checked before Enter button is enabled', () => {
    render(<AgeGate onVerified={onVerified} />);
    const enterBtn = screen.getByRole('button', { name: /ENTER — I AM 18 OR OLDER/i });
    expect(enterBtn).toBeDisabled();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);
    expect(enterBtn).toBeDisabled();

    fireEvent.click(checkboxes[3]);
    expect(enterBtn).toBeEnabled();
  });

  it('calls onVerified and sets localStorage when Enter is clicked', async () => {
    render(<AgeGate onVerified={onVerified} />);
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(cb => fireEvent.click(cb));

    const enterBtn = screen.getByRole('button', { name: /ENTER — I AM 18 OR OLDER/i });
    fireEvent.click(enterBtn);

    expect(onVerified).toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem('adultZoneVerified') || '{}');
    expect(stored.verified).toBe(true);
  });

  it('navigates to home when Exit is clicked', () => {
    render(<AgeGate onVerified={onVerified} />);
    const exitBtn = screen.getByRole('button', { name: /EXIT — Take me back/i });
    fireEvent.click(exitBtn);
    expect(window.location.href).toBe('/');
  });
});
