import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const API_BASE_URL = 'http://localhost:5000/api';

export const handlers = [
  http.post(`${API_BASE_URL}/adult/auth/login`, async () => {
    return HttpResponse.json({
      success: true,
      data: {
        accessToken: 'mock_access_token',
        user: { id: '1', username: 'testuser', role: 'user', ageVerified: true }
      }
    });
  }),

  http.get(`${API_BASE_URL}/adult/credits/balance`, () => {
    return HttpResponse.json({
      success: true,
      data: { credits: 500, tier: 'none' }
    });
  }),

  http.get(`${API_BASE_URL}/adult/providers`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        providers: [
          { _id: 'p1', username: 'Sarah', providerProfile: { stageName: 'Sultry Sarah', isLive: true, rating: { average: 4.8 } } }
        ],
        total: 1, page: 1, pages: 1
      }
    });
  }),
];

export const server = setupServer(...handlers);
