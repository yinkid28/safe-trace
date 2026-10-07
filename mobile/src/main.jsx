import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import { AuthProvider } from "./context/AuthContext";
import { LocationProvider } from "./context/LocationContext";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App";
import "./styles/global.css";

// Prevent unhandled promise rejections from crashing the Android WebView
window.addEventListener("unhandledrejection", (e) => {
  console.warn("Unhandled promise rejection:", e.reason);
  e.preventDefault();
});

// Register Capacitor PWA elements (camera modal, toast, etc.) for browser use
defineCustomElements(window);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <LocationProvider>
            <App />
          </LocationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
