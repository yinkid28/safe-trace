import { useState, useRef, useEffect, useCallback } from "react";
import { doc, updateDoc, getDoc, arrayUnion } from "firebase/firestore";
import { db } from "../config/firebase";
import { useLocation } from "./useLocation";
import { useAuth } from "./useAuth";
import { haversineDistance } from "../utils/geo";

const DWELL_RADIUS_KM = 0.1; // 100 metres
const DWELL_MIN_MS = 5 * 60 * 1000; // 5 minutes
const KNOWN_ZONE_RADIUS_KM = 0.2; // 200 metres — matches safe zone display radius

/**
 * Suggest a default label based on current time-of-day.
 */
function suggestLabel(hour) {
  if (hour >= 6 && hour < 10) return "Morning spot";
  if (hour >= 10 && hour < 17) return "Daytime spot";
  if (hour >= 17 && hour < 21) return "Evening spot";
  return "Night location";
}

/**
 * Round a coordinate to 4 decimal places (~11 m) for dedup keys.
 */
function placeKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Detects when the user has stopped at an unrecognised location and
 * offers to save it as a safe zone.
 *
 * Algorithm:
 *  - Track an "anchor point" from GPS updates
 *  - If user stays within 100 m of anchor for 5+ minutes and the spot
 *    is not near an existing safe zone, surface a suggestion
 *  - Reset anchor when user moves >100 m away
 *
 * All logic runs on the frontend — no API calls needed.
 */
export function usePlaceDetection(user) {
  const { position } = useLocation();
  const { refreshProfile } = useAuth();

  const [detectedPlace, setDetectedPlace] = useState(null);
  const [saving, setSaving] = useState(false);

  const anchorRef = useRef(null); // { lat, lng, time }
  const dismissedRef = useRef(new Set());
  const suggestedRef = useRef(false); // prevents re-triggering while still at same anchor

  // Check if a point is near any existing safe zone
  const isNearKnownZone = useCallback(
    (lat, lng) => {
      const zones = [
        ...(user?.safeZones || []),
      ];
      return zones.some(
        (z) =>
          z.lat != null &&
          z.lng != null &&
          haversineDistance(lat, lng, z.lat, z.lng) < KNOWN_ZONE_RADIUS_KM,
      );
    },
    [user?.safeZones],
  );

  // Core detection: run on every position update
  useEffect(() => {
    if (!position || !user) return;

    const { lat, lng } = position;
    const now = Date.now();

    // No anchor yet — set one
    if (!anchorRef.current) {
      anchorRef.current = { lat, lng, time: now };
      suggestedRef.current = false;
      return;
    }

    const dist = haversineDistance(
      anchorRef.current.lat,
      anchorRef.current.lng,
      lat,
      lng,
    );

    if (dist >= DWELL_RADIUS_KM) {
      // User moved away — reset
      anchorRef.current = { lat, lng, time: now };
      suggestedRef.current = false;
      // Clear any active suggestion if user walked away
      if (detectedPlace) setDetectedPlace(null);
      return;
    }

    // Still within radius — check dwell time
    const dwell = now - anchorRef.current.time;
    if (dwell >= DWELL_MIN_MS && !suggestedRef.current) {
      const key = placeKey(anchorRef.current.lat, anchorRef.current.lng);

      if (!dismissedRef.current.has(key) && !isNearKnownZone(anchorRef.current.lat, anchorRef.current.lng)) {
        const hour = new Date().getHours();
        setDetectedPlace({
          lat: anchorRef.current.lat,
          lng: anchorRef.current.lng,
          dwellMinutes: Math.floor(dwell / 60000),
          suggestedLabel: suggestLabel(hour),
        });
        suggestedRef.current = true;
      }
    }

    // Update dwell time on an existing suggestion
    if (detectedPlace && dwell >= DWELL_MIN_MS) {
      const newMinutes = Math.floor(dwell / 60000);
      if (newMinutes !== detectedPlace.dwellMinutes) {
        setDetectedPlace((prev) => (prev ? { ...prev, dwellMinutes: newMinutes } : null));
      }
    }
  }, [position, user, isNearKnownZone, detectedPlace]);

  /** User taps "Not Now" — dismiss this location for the session */
  const dismissPlace = useCallback(() => {
    if (detectedPlace) {
      dismissedRef.current.add(placeKey(detectedPlace.lat, detectedPlace.lng));
    }
    setDetectedPlace(null);
    suggestedRef.current = true; // prevent re-triggering at same anchor
  }, [detectedPlace]);

  /** User saves the detected place as a safe zone */
  const savePlaceAsZone = useCallback(
    async (label, type = "other", shareWithFamily = false) => {
      if (!detectedPlace || !user?.uid) return;

      setSaving(true);
      try {
        const newZone = {
          label: label.trim(),
          lat: detectedPlace.lat,
          lng: detectedPlace.lng,
          type,
        };

        const updatedZones = [...(user.safeZones || []), newZone];
        await updateDoc(doc(db, "users", user.uid), {
          safeZones: updatedZones,
        });

        // Share with family if requested
        if (user.familyId && shareWithFamily) {
          await updateDoc(doc(db, "families", user.familyId), {
            sharedSafeZones: arrayUnion({
              label: newZone.label,
              lat: newZone.lat,
              lng: newZone.lng,
              type: newZone.type,
              addedBy: user.uid,
            }),
          });
        }

        await refreshProfile();
        setDetectedPlace(null);
        suggestedRef.current = true;
      } catch (err) {
        console.error("Failed to save place:", err);
      } finally {
        setSaving(false);
      }
    },
    [detectedPlace, user, refreshProfile],
  );

  return { detectedPlace, dismissPlace, savePlaceAsZone, saving };
}
