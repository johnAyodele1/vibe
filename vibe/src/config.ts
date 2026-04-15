// Use environment variables for API and Socket URLs, with sensible fallbacks
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

// Socket URL for real-time connections
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? window.location.origin : undefined);
