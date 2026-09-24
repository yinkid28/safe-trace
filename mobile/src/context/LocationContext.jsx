import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";

export const LocationContext = createContext(null);

const POLL_INTERVAL_MS = 60_000; // 60 seconds (browser fallback)
const DISTANCE_FILTER_M = 30; // Native: update every 30 meters of movement
export const LAGOS_DEFAULT = { lat: 6.5158, lng: 3.3775 };

const isNative = Capacitor.isNativePlatform();

export function LocationProvider({ children }) {
  const { user } = useAuth();
  const [position, setPosition] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("prompt");
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const bgWatcherIdRef = useRef(null);
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Shared handler for writing location to Firestore
  const writeLocationToFirestore = useCallback(async (loc) => {
    const currentUser = userRef.current;
    if (currentUser?.uid) {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), {
          lastLocation: loc,
          lastSeen: serverTimestamp(),
          phoneStatus: "online",
        });
      } catch (_) {
        // Firestore write failure — don't break tracking
      }
    }
  }, []);

  // Shared handler for processing a location update
  const handleLocationUpdate = useCallback((loc) => {
    setPosition(loc);
    setError(null);
    writeLocationToFirestore(loc);
  }, [writeLocationToFirestore]);

  // === BROWSER FALLBACK: poll-based tracking ===
  const updatePositionBrowser = useCallback(async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });

      handleLocationUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
      });
    } catch (err) {
      setError(err.message || "Could not get location");
    }
  }, [handleLocationUpdate]);

  const startBrowserTracking = useCallback(() => {
    if (intervalRef.current) return;
    updatePositionBrowser();
    intervalRef.current = setInterval(updatePositionBrowser, POLL_INTERVAL_MS);
    setTracking(true);
  }, [updatePositionBrowser]);

  const stopBrowserTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
  }, []);

  // === NATIVE: background geolocation via @capgo/background-geolocation ===
  const startNativeTracking = useCallback(async () => {
    if (bgWatcherIdRef.current) return;

    try {
      const { BackgroundGeolocation } = await import("@capgo/background-geolocation");

      bgWatcherIdRef.current = await BackgroundGeolocation.start(
        {
          backgroundMessage: "SafeTrace is monitoring your safety in the background.",
          backgroundTitle: "SafeTrace Active",
          requestPermissions: true,
          stale: false,
          distanceFilter: DISTANCE_FILTER_M,
        },
        (location, err) => {
          if (err) {
            setError(err.message || "Background location error");
            return;
          }
          if (location) {
            handleLocationUpdate({
              lat: location.latitude,
              lng: location.longitude,
              speed: location.speed || 0,
              heading: location.bearing || 0,
            });
          }
        }
      );

      setTracking(true);
    } catch (err) {
      // Background geolocation plugin not available, fall back to browser polling
      console.warn("Background geolocation unavailable, using browser fallback:", err);
      startBrowserTracking();
    }
  }, [handleLocationUpdate, startBrowserTracking]);

  const stopNativeTracking = useCallback(async () => {
    if (bgWatcherIdRef.current) {
      try {
        const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
        await BackgroundGeolocation.stop();
      } catch (_) {
        // Best effort
      }
      bgWatcherIdRef.current = null;
    }
    setTracking(false);
  }, []);

  // Public start/stop that pick the right strategy
  const startTracking = useCallback(() => {
    if (isNative) {
      startNativeTracking();
    } else {
      startBrowserTracking();
    }
  }, [startNativeTracking, startBrowserTracking]);

  const stopTracking = useCallback(() => {
    if (isNative) {
      stopNativeTracking();
    } else {
      stopBrowserTracking();
    }
  }, [stopNativeTracking, stopBrowserTracking]);

  // Auto-start when user is authenticated
  useEffect(() => {
    if (!user) {
      stopTracking();
      setPosition(null);
      setPermissionStatus("prompt");
      return;
    }

    let cancelled = false;

    async function initLocation() {
      try {
        if (isNative) {
          // Native: background-geolocation handles permissions itself
          setPermissionStatus("granted");
          startTracking();
        } else {
          // Browser: check via Capacitor Geolocation API
          const status = await Geolocation.checkPermissions();
          if (cancelled) return;

          if (status.location === "granted") {
            setPermissionStatus("granted");
            startTracking();
          } else if (status.location === "denied") {
            setPermissionStatus("denied");
          } else {
            const result = await Geolocation.requestPermissions();
            if (cancelled) return;

            if (result.location === "granted") {
              setPermissionStatus("granted");
              startTracking();
            } else {
              setPermissionStatus("denied");
            }
          }
        }
      } catch (_) {
        if (!cancelled) {
          setPermissionStatus("unavailable");
        }
      }
    }

    initLocation();

    return () => {
      cancelled = true;
      stopTracking();
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const value = {
    position,
    tracking,
    permissionStatus,
    error,
    startTracking,
    stopTracking,
    defaultCenter: LAGOS_DEFAULT,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}
