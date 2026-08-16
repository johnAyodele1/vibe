import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVideoReadinessOptions {
  onReady?: () => void;
  onNotReady?: () => void;
}

export function useVideoReadiness(options?: UseVideoReadinessOptions) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const resetReadiness = useCallback(() => {
    setIsVideoReady(false);
    options?.onNotReady?.();
  }, [options]);

  const markReady = useCallback(() => {
    setIsVideoReady(true);
    options?.onReady?.();
  }, [options]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanupVideoListeners: (() => void) | null = null;

    const setupVideoElement = (videoEl: HTMLVideoElement) => {
      if (cleanupVideoListeners) cleanupVideoListeners();

      const checkState = () => {
        const isReady =
          videoEl.readyState >= 3 &&
          !videoEl.paused &&
          (videoEl.videoWidth > 0 || videoEl.videoHeight > 0 || videoEl.currentTime > 0);

        if (isReady) {
          markReady();
        }
      };

      const handlePlaying = () => {
        if (videoEl.readyState >= 2 || videoEl.videoWidth > 0) {
          markReady();
        }
      };

      const handlePauseOrWait = () => {
        resetReadiness();
      };

      videoEl.addEventListener('playing', handlePlaying);
      videoEl.addEventListener('canplay', checkState);
      videoEl.addEventListener('loadedmetadata', checkState);
      videoEl.addEventListener('resize', checkState);
      videoEl.addEventListener('waiting', handlePauseOrWait);
      videoEl.addEventListener('pause', handlePauseOrWait);
      videoEl.addEventListener('ended', handlePauseOrWait);
      videoEl.addEventListener('error', handlePauseOrWait);

      // Initial check
      checkState();

      cleanupVideoListeners = () => {
        videoEl.removeEventListener('playing', handlePlaying);
        videoEl.removeEventListener('canplay', checkState);
        videoEl.removeEventListener('loadedmetadata', checkState);
        videoEl.removeEventListener('resize', checkState);
        videoEl.removeEventListener('waiting', handlePauseOrWait);
        videoEl.removeEventListener('pause', handlePauseOrWait);
        videoEl.removeEventListener('ended', handlePauseOrWait);
        videoEl.removeEventListener('error', handlePauseOrWait);
      };
    };

    // Check existing video element inside container
    const existingVideo =
      container.tagName === 'VIDEO'
        ? (container as unknown as HTMLVideoElement)
        : container.querySelector('video');

    if (existingVideo) {
      setupVideoElement(existingVideo);
    }

    // MutationObserver to watch for Agora or WebRTC injecting <video> elements dynamically
    const observer = new MutationObserver(() => {
      const videoEl =
        container.tagName === 'VIDEO'
          ? (container as unknown as HTMLVideoElement)
          : container.querySelector('video');

      if (videoEl) {
        setupVideoElement(videoEl);
      } else {
        resetReadiness();
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (cleanupVideoListeners) cleanupVideoListeners();
    };
  }, [markReady, resetReadiness]);

  return {
    isVideoReady,
    setIsVideoReady,
    containerRef,
    resetReadiness,
    markReady,
  };
}

export default useVideoReadiness;
