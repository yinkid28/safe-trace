import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";

export const LocationContext = createContext(null);

const POLL_INTERVAL_MS = 60_000; // 60 seconds
export const LAGOS_DEFAULT = { lat: 6.5158, lng: 3.3775 };

export function LocationProvider({ children }) {
  const { user } = useAuth();
  const [position, setPosition] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("prompt"); // prompt | granted | denied | unavailable
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const userRef = useRef(user);

  // Keep userRef in sync so the interval callback always has the latest user
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const updatePosition = useCallback(async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      });

      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
      };

      setPosition(loc);
      setError(null);

      // Write to Firestore if we have an authenticated user
      const currentUser = userRef.current;
      if (currentUser?.uid) {
        try {
          await updateDoc(doc(db, "users", currentUser.uid), {
            lastLocation: loc,
            lastSeen: serverTimestamp(),
            phoneStatus: "online",
          });
        } catch (_) {
          // Firestore write failure — don't break the polling loop
        }
      }
    } catch (err) {
      setError(err.message || "Could not get location");
    }
  }, []);

  const startTracking = useCallback(() => {
    if (intervalRef.current) return; // already tracking

    // Get position immediately, then poll
    updatePosition();
    intervalRef.current = setInterval(updatePosition, POLL_INTERVAL_MS);
    setTracking(true);
  }, [updatePosition]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTracking(false);
  }, []);

  // Check and request permissions when user is authenticated
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
        const status = await Geolocation.checkPermissions();
        if (cancelled) return;

        if (status.location === "granted") {
          setPermissionStatus("granted");
          startTracking();
        } else if (status.location === "denied") {
          setPermissionStatus("denied");
        } else {
          // prompt — request permission
          const result = await Geolocation.requestPermissions();
          if (cancelled) return;

          if (result.location === "granted") {
            setPermissionStatus("granted");
            startTracking();
          } else {
            setPermissionStatus("denied");
          }
        }
      } catch (_) {
        // Geolocation API unavailable (e.g. non-HTTPS, unsupported browser)
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
  }, [user, startTracking, stopTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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
