import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { toast } from "sonner";
import "./index.css";
import App from "./components/App/App";
import { AuthProvider } from "./contexts/AuthContext";
import { AdultAuthProvider } from "./contexts/AdultAuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import { PWAProvider } from "./contexts/PWAContext";

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast.info("New version available!", {
                  description: "Please refresh to update the app.",
                  action: { label: "Refresh", onClick: () => window.location.reload() },
                  duration: Infinity,
                });
              }
            });
          }
        });
      })
      .catch((error) => console.log('ServiceWorker registration failed: ', error));
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AdultAuthProvider>
        <SocketProvider>
          <PWAProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </PWAProvider>
        </SocketProvider>
      </AdultAuthProvider>
    </AuthProvider>
  </StrictMode>
);
