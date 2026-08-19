import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export interface LocationItem {
  name: string;
  code?: string;
  isoCode?: string;
  flag?: string;
  lat?: number;
  lng?: number;
  [key: string]: unknown;
}

const cache = new Map<string, unknown>();

async function fetchWithCache<T>(url: string): Promise<T> {
  if (cache.has(url)) {
    return cache.get(url) as T;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch ' + url);
  }
  const data = await response.json();
  cache.set(url, data);
  return data as T;
}

export const useCountries = () => {
  const [data, setData] = useState<LocationItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    fetchWithCache<LocationItem[]>(`${API_BASE_URL}/v1/shared/countries`)
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  return { data, loading, error };
};

export const useStates = (countryCode: string | null) => {
  const [data, setData] = useState<LocationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!countryCode) {
      setTimeout(() => {
        setData(null);
        setLoading(false);
      }, 0);
      return;
    }
    let active = true;
    setTimeout(() => setLoading(true), 0);
    fetchWithCache<LocationItem[]>(`${API_BASE_URL}/v1/shared/countries/${countryCode}/states`)
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [countryCode]);

  return { data, loading, error };
};

export const useCities = (countryCode: string | null, stateCode: string | null, query: string = '') => {
  const [data, setData] = useState<LocationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!countryCode || !stateCode) {
      setTimeout(() => {
        setData(null);
        setLoading(false);
      }, 0);
      return;
    }
    let active = true;
    setTimeout(() => setLoading(true), 0);
    const url = `${API_BASE_URL}/v1/shared/cities?country=${countryCode}&state=${stateCode}&q=${encodeURIComponent(query)}`;
    fetch(url)
      .then(res => res.json())
      .then((res: LocationItem[]) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [countryCode, stateCode, query]);

  return { data, loading, error };
};
