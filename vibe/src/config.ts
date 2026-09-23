const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('API_BASE_URL_OVERRIDE');
    if (override) return override;
  }
  return import.meta.env.PROD
    ? "https://zippo-r8hk.onrender.com/api"
    : "/api";
};

const getSocketUrl = () => {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('SOCKET_URL_OVERRIDE');
    if (override) return override;
  }
  return import.meta.env.PROD
    ? "https://zippo-r8hk.onrender.com"
    : undefined;
};

// Use full backend URL for production, relative path for development
export const API_BASE_URL = getApiBaseUrl();

// Public clubs/parties and ticket routes are mounted under /api/v1.
export const V1_API_BASE_URL = API_BASE_URL.endsWith('/v1') ? API_BASE_URL : `${API_BASE_URL}/v1`;

// Socket URL for real-time connections
export const SOCKET_URL = getSocketUrl();
