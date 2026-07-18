import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

const cache = new Map<string, any>();

async function fetchWithCache(url: string) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch ' + url);
  }
  const data = await response.json();
  cache.set(url, data);
  return data;
}

export const useCountries = () => {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let active = true;
    fetchWithCache(`${API_BASE_URL}/v1/shared/countries`)
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  return { data, loading, error };
};

export const useStates = (countryCode: string | null) => {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!countryCode) {
      setData(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchWithCache(`${API_BASE_URL}/v1/shared/countries/${countryCode}/states`)
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [countryCode]);

  return { data, loading, error };
};

export const useCities = (countryCode: string | null, stateCode: string | null, query: string = '') => {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!countryCode || !stateCode) {
      setData(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const url = `${API_BASE_URL}/v1/shared/cities?country=${countryCode}&state=${stateCode}&q=${encodeURIComponent(query)}`;
    fetch(url)
      .then(res => res.json())
      .then(res => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [countryCode, stateCode, query]);

  return { data, loading, error };
};
