import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdvertisementOverlay from '../components/Advertisement/AdvertisementOverlay';
import { AdvertisementCard } from '../components/Advertisement/AdvertisementCard';
import { EligibleAdvertisement } from '../components/Advertisement/types';

describe('Advertisement Card & Overlay Components', () => {
  const sampleImageAd: EligibleAdvertisement = {
    id: 'ad_123',
    title: 'Weekend Super Discount',
    description: 'Get 50% off on all items today only!',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
    thumbnailUrl: null,
    clickUrl: 'https://example.com/deal',
    displayDurationSeconds: 10,
    closeAfterSeconds: 5,
  };

  const sampleVideoAd: EligibleAdvertisement = {
    id: 'ad_456',
    title: 'New Video Feature',
    description: 'Check out our new streaming features',
    mediaType: 'video',
    mediaUrl: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop',
    clickUrl: 'https://example.com/video-link',
    displayDurationSeconds: 15,
    closeAfterSeconds: 5,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders advertisement image overlay correctly with title and description', () => {
    const onClose = vi.fn();
    render(<AdvertisementOverlay ad={sampleImageAd} onClose={onClose} />);

    expect(screen.getByTestId('advertisement-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('advertisement-card')).toBeInTheDocument();
    expect(screen.getByText('Weekend Super Discount')).toBeInTheDocument();
    expect(screen.getByText('Get 50% off on all items today only!')).toBeInTheDocument();

    const img = screen.getByTestId('ad-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop');
  });

  it('renders video element for video advertisement', () => {
    const onClose = vi.fn();
    render(<AdvertisementOverlay ad={sampleVideoAd} onClose={onClose} />);

    const video = screen.getByTestId('ad-video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', 'https://example.com/video.mp4');
  });

  it('keeps close button disabled during initial closeAfterSeconds countdown', () => {
    const onClose = vi.fn();
    render(<AdvertisementCard ad={sampleImageAd} onClose={onClose} />);

    const closeBtn = screen.getByTestId('ad-close-button');
    expect(closeBtn).toBeDisabled();
    expect(closeBtn).toHaveTextContent('⏱ Close in 5s');

    // Attempt click while disabled
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enables close button after countdown and invokes onClose when clicked', () => {
    const onClose = vi.fn();
    render(<AdvertisementCard ad={sampleImageAd} onClose={onClose} />);

    const closeBtn = screen.getByTestId('ad-close-button');
    expect(closeBtn).toBeDisabled();

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(closeBtn).not.toBeDisabled();
    expect(closeBtn).toHaveTextContent('✕ Close');

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses when displayDurationSeconds expires', () => {
    const onClose = vi.fn();
    const onAutoDismiss = vi.fn();
    render(
      <AdvertisementCard
        ad={sampleImageAd}
        onClose={onClose}
        onAutoDismiss={onAutoDismiss}
      />
    );

    // Fast-forward 10 seconds (displayDuration)
    act(() => {
      vi.advanceTimersByTime(10100);
    });

    expect(onAutoDismiss).toHaveBeenCalledTimes(1);
  });

  it('invokes onClickCTA when CTA button is clicked without triggering close', () => {
    const onClose = vi.fn();
    const onClickCTA = vi.fn();

    render(
      <AdvertisementCard
        ad={sampleImageAd}
        onClose={onClose}
        onClickCTA={onClickCTA}
      />
    );

    const ctaBtn = screen.getByTestId('ad-cta-button');
    expect(ctaBtn).toBeInTheDocument();

    fireEvent.click(ctaBtn);
    expect(onClickCTA).toHaveBeenCalledWith('ad_123', 'https://example.com/deal');
    expect(onClose).not.toHaveBeenCalled();
  });
});
