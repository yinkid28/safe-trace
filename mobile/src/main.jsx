import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import { AuthProvider } from "./context/AuthContext";
import { LocationProvider } from "./context/LocationContext";
import App from "./App";
import "./styles/global.css";

// Register Capacitor PWA elements (camera modal, toast, etc.) for browser use
defineCustomElements(window);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LocationProvider>
          <App />
        </LocationProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
