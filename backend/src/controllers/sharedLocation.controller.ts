import { Request, Response } from 'express';
import { Country, State, City } from 'country-state-city';
import { getCache, setCache } from '../config/redisFallback';

export const getCountries = async (req: Request, res: Response) => {
  try {
    const cacheKey = 'location:countries';
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const countries = Country.getAllCountries().map(c => ({
      code: c.isoCode,
      name: c.name,
      dialCode: c.phonecode.startsWith('+') ? c.phonecode : `+${c.phonecode}`,
      flag: c.flag || '',
      currency: c.currency || '',
    })).sort((a, b) => a.name.localeCompare(b.name));

    await setCache(cacheKey, 86400, countries);
    return res.json(countries);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getStatesByCountry = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Country code is required' });
    }
    const countryCode = String(code).toUpperCase();
    const cacheKey = `location:states:${countryCode}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const states = State.getStatesOfCountry(countryCode).map(s => ({
      code: s.isoCode,
      name: s.name,
    })).sort((a, b) => a.name.localeCompare(b.name));

    await setCache(cacheKey, 86400, states);
    return res.json(states);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getCities = async (req: Request, res: Response) => {
  try {
    const { country, state, q } = req.query;
    if (!country || !state) {
      return res.status(400).json({ success: false, error: 'Country and state are required' });
    }

    const countryCode = String(country).toUpperCase();
    const stateCode = String(state).toUpperCase();
    const queryStr = q ? String(q).toLowerCase().trim() : '';

    // Optimization (⚡ Bolt): Cache base city lists per country and state to avoid re-parsing country-state-city on every request.
    const cacheKey = `location:cities:${countryCode}:${stateCode}`;
    let cities: Array<{ name: string; lat: number; lng: number }> | null = await getCache(cacheKey);

    if (!cities) {
      cities = City.getCitiesOfState(countryCode, stateCode).map(c => ({
        name: c.name,
        lat: parseFloat(c.latitude || '0'),
        lng: parseFloat(c.longitude || '0'),
      })).sort((a, b) => a.name.localeCompare(b.name));

      await setCache(cacheKey, 86400, cities);
    }

    if (queryStr) {
      cities = cities.filter(c => c.name.toLowerCase().startsWith(queryStr));
    }

    return res.json(cities.slice(0, 20));
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
