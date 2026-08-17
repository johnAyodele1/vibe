import { useState, useCallback, useRef, useEffect } from 'react';
import { detectContactSharing } from '@yourapp/content-filter';

export const useContentFilter = (_accountType: 'member' | 'service_provider') => {
  void _accountType;

  const [filterWarning, setFilterWarning] = useState<{
    show: boolean;
    category: 'phone' | 'platform' | 'email' | 'offplatform' | string | null;
  }>({ show: false, category: null });

  const lastWarnedText = useRef<string>('');
  const timeoutRef = useRef<any>(null);

  const checkContent = useCallback((text: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (text === lastWarnedText.current) return; // same text, don't re-warn

      const result = detectContactSharing(text);
      if (result.detected) {
        lastWarnedText.current = text;
        setFilterWarning({ show: true, category: result.category });
      } else {
        setFilterWarning({ show: false, category: null });
      }
    }, 500);
  }, []);

  // Check before send (final check)
  const checkBeforeSend = useCallback((text: string): boolean => {
    const result = detectContactSharing(text);
    return !result.detected; // returns true if SAFE to send
  }, []);

  const dismissWarning = useCallback(() => {
    setFilterWarning({ show: false, category: null });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { filterWarning, checkContent, checkBeforeSend, dismissWarning, setFilterWarning };
};
