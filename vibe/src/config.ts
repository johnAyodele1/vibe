// Use full backend URL for production, relative path for development
export const API_BASE_URL = import.meta.env.PROD
  ? "https://zippo-r8hk.onrender.com/api"
  : "/api";
