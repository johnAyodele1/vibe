import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LocationSelect from '../components/AdultZone/LocationSelect';

// Mock the location hooks relative to the test file's location
vi.mock('../hooks/useLocation', () => {
  return {
    useCountries: () => ({
      data: [
        { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
        { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' }
      ],
      loading: false,
      error: null
    }),
    useStates: (countryCode: string | null) => ({
      data: countryCode === 'NG' ? [
        { code: 'LA', name: 'Lagos' },
        { code: 'AB', name: 'Abia' }
      ] : [],
      loading: false,
      error: null
    }),
    useCities: (countryCode: string | null, stateCode: string | null, _query: string) => ({
      data: countryCode === 'NG' && stateCode === 'LA' ? [
        { name: 'Ikeja', lat: 6.596, lng: 3.336 },
        { name: 'Lekki', lat: 6.428, lng: 3.518 }
      ] : [],
      loading: false,
      error: null
    })
  };
});

describe('LocationSelect Component', () => {
  it('renders country, state, and city labels correctly', () => {
    const onChange = vi.fn();
    render(<LocationSelect value={{}} onChange={onChange} />);

    expect(screen.getByText('Country')).toBeInTheDocument();
    expect(screen.getByText('State/Region')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
  });

  it('clicking Country button opens modal with list of countries', () => {
    const onChange = vi.fn();
    render(<LocationSelect value={{}} onChange={onChange} />);

    const countryButton = screen.getByRole('button', { name: /Select Country/i });
    fireEvent.click(countryButton);

    expect(screen.getByText('Select Country')).toBeInTheDocument();
    expect(screen.getByText('Nigeria')).toBeInTheDocument();
    expect(screen.getByText('United States')).toBeInTheDocument();
  });

  it('selecting a country triggers onChange with country selected and resets state/city', () => {
    const onChange = vi.fn();
    render(<LocationSelect value={{}} onChange={onChange} />);

    const countryButton = screen.getByRole('button', { name: /Select Country/i });
    fireEvent.click(countryButton);

    const nigeriaOption = screen.getByText('Nigeria');
    fireEvent.click(nigeriaOption);

    expect(onChange).toHaveBeenCalledWith({
      country: { code: 'NG', name: 'Nigeria' },
      state: undefined,
      city: undefined
    });
  });

  it('clicking State button opens states modal when country is selected', () => {
    const onChange = vi.fn();
    render(
      <LocationSelect
        value={{ country: { code: 'NG', name: 'Nigeria' } }}
        onChange={onChange}
      />
    );

    const stateButton = screen.getByRole('button', { name: /Select State\/Region/i });
    fireEvent.click(stateButton);

    expect(screen.getByText('Lagos')).toBeInTheDocument();
    expect(screen.getByText('Abia')).toBeInTheDocument();
  });
});
