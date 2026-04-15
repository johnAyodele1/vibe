import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "GOOGLE_"],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "https://zippo-r8hk.onrender.com",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "https://zippo-r8hk.onrender.com",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
