import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./components/App/App";
import { AuthProvider } from "./contexts/AuthContext";
import GoogleAuthProviderWrapper from "./components/Auth/GoogleAuthProviderWrapper";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleAuthProviderWrapper>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </GoogleAuthProviderWrapper>
  </StrictMode>
);
