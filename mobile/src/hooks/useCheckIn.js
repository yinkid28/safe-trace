import { useCallback, useEffect, useRef, useState } from "react";
import { doc, updateDoc, setDoc, collection, deleteField } from "firebase/firestore";
import { db } from "../config/firebase";
import { useLocation } from "./useLocation";
import { sendNotification } from "../utils/notify";

const GRACE_PERIOD_S = 60; // seconds before auto-escalation
const DEFAULT_AGENCY_ID = "agency_yaba";

/**
 * Convert a Firestore timestamp (or Date or epoch) to a JS Date.
 */
function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val.toMillis === "function") return new Date(val.toMillis());
  if (typeof val === "number") return new Date(val);
  return null;
}

/**
 * Break milliseconds into { hours, minutes, seconds }.
 */
function msToHMS(ms) {
  if (ms <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  const totalSec = Math.floor(ms / 1000);
  return {
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

/**
 * Client-side check-in scheduler.
 *
 * Manages set → countdown → grace period → alert lifecycle.
 * Persists to Firestore (user doc `activeCheckIn` field) so the
 * check-in survives app restarts.
 *
 * @param {object|null} user - Current user from useAuth
 * @returns {{ checkIn, graceActive, graceCountdown, remaining, setCheckIn, cancelCheckIn, confirmSafe }}
 */
export function useCheckIn(user) {
  const { position } = useLocation();

  // Local state — source of truth during this session
  const [checkIn, setCheckInState] = useState(null); // { expiresAt: Date, label: string }
  const [graceActive, setGraceActive] = useState(false);
  const [graceCountdown, setGraceCountdown] = useState(null);
  const [remaining, setRemaining] = useState(null);

  const intervalRef = useRef(null);
  const escalatedRef = useRef(false);
  const userRef = useRef(user);
  const positionRef = useRef(position);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Hydrate from user doc on mount
  useEffect(() => {
    if (!user?.activeCheckIn) return;

    const expiresAt = toDate(user.activeCheckIn.expiresAt);
    if (!expiresAt) return;

    setCheckInState({
      expiresAt,
      label: user.activeCheckIn.label || "",
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear check-in from Firestore
  const clearFirestore = useCallback(async () => {
    const u = userRef.current;
    if (!u?.uid) return;
    try {
      await updateDoc(doc(db, "users", u.uid), {
        activeCheckIn: deleteField(),
      });
    } catch (_) {
      // Best effort
    }
  }, []);

  // Create the escalation alert
  const createAlert = useCallback(async (expiresAt) => {
    if (escalatedRef.current) return;
    escalatedRef.current = true;

    const u = userRef.current;
    if (!u?.uid) return;

    const pos = positionRef.current;
    const loc = pos
      ? { lat: pos.lat, lng: pos.lng, speed: pos.speed || 0, heading: pos.heading || 0 }
      : { lat: 0, lng: 0, speed: 0, heading: 0 };

    const alertRef = doc(collection(db, "alerts"));
    try {
      await setDoc(alertRef, {
        userId: u.uid,
        userName: u.name || "Unknown",
        familyId: u.familyId || "no_family",
        agencyId: u.directAgencyId || DEFAULT_AGENCY_ID,
        type: "checkin",
        status: "new",
        createdAt: new Date(),
        lastKnownLocation: loc,
        locationName:
          loc.lat && loc.lng
            ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
            : "Unknown",
        riskScore: 0.7,
        explanations: ["User did not respond to scheduled safety check-in"],
        evidenceUrls: [],
        escalated: true,
        escalatedAt: new Date(),
        trajectory: [],
        timeline: [
          { event: "Check-in timer expired", timestamp: expiresAt },
          { event: "User did not respond within grace period", timestamp: new Date() },
          { event: "Alert auto-escalated to agency", timestamp: new Date() },
        ],
        notes: [],
      });
      sendNotification({
        alertId: alertRef.id,
        alertType: "checkin",
        userName: u.name || "Unknown",
        familyId: u.familyId || "no_family",
        agencyId: u.directAgencyId || DEFAULT_AGENCY_ID,
        locationName:
          loc.lat && loc.lng
            ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
            : "Unknown",
      });
    } catch (_) {
      // Alert creation failed
    }

    await clearFirestore();
  }, [clearFirestore]);

  // Main tick — runs every second while a check-in is active
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!checkIn) {
      setRemaining(null);
      setGraceActive(false);
      setGraceCountdown(null);
      return;
    }

    escalatedRef.current = false;

    function tick() {
      const now = Date.now();
      const expiryMs = checkIn.expiresAt.getTime();
      const diff = expiryMs - now;

      if (diff > 0) {
        // Still counting down
        setRemaining(msToHMS(diff));
        setGraceActive(false);
        setGraceCountdown(null);
      } else {
        // Expired — grace period
        setRemaining({ hours: 0, minutes: 0, seconds: 0 });
        setGraceActive(true);

        const graceElapsed = Math.floor((now - expiryMs) / 1000);
        const graceLeft = GRACE_PERIOD_S - graceElapsed;

        if (graceLeft > 0) {
          setGraceCountdown(graceLeft);
        } else {
          // Grace period over — escalate
          setGraceCountdown(0);
          createAlert(checkIn.expiresAt);
          setCheckInState(null);
        }
      }
    }

    tick(); // immediate first evaluation
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkIn, createAlert]);

  // Set a new check-in
  const setCheckIn = useCallback(
    async (durationMs, label = "") => {
      const u = userRef.current;
      if (!u?.uid) return;

      const expiresAt = new Date(Date.now() + durationMs);
      const data = { expiresAt, label };

      setCheckInState(data);

      try {
        await updateDoc(doc(db, "users", u.uid), {
          activeCheckIn: data,
        });
      } catch (_) {
        // Firestore write failed — local timer still runs
      }
    },
    []
  );

  // Cancel an active check-in
  const cancelCheckIn = useCallback(async () => {
    setCheckInState(null);
    setGraceActive(false);
    setGraceCountdown(null);
    await clearFirestore();
  }, [clearFirestore]);

  // Confirm safe (same as cancel, used during grace period)
  const confirmSafe = useCallback(async () => {
    await cancelCheckIn();
  }, [cancelCheckIn]);

  return {
    checkIn,
    graceActive,
    graceCountdown,
    remaining,
    setCheckIn,
    cancelCheckIn,
    confirmSafe,
  };
}
