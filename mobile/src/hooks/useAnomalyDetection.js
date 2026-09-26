import { useState, useEffect, useRef, useCallback } from "react";
import { useTrajectoryBuffer } from "./useTrajectoryBuffer";
import { useLocation } from "./useLocation";

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || "";
const SCORE_EVERY_N_POINTS = 5; // Score every 5 new GPS points
const CHECKIN_TIMEOUT_MS = 60_000; // 60 seconds to respond before auto-escalation

/**
 * Connects the GPS trajectory buffer to the AI anomaly detection service.
 *
 * When an anomaly is detected:
 *  - Sets `anomalyAlert` with { riskScore, explanations }
 *  - Starts a 60-second countdown
 *  - If user doesn't dismiss, `escalate` becomes true
 */
export function useAnomalyDetection(user, sharedSafeZones = []) {
  const { position } = useLocation();
  const { addPoint, getPoints, clearBuffer, count } = useTrajectoryBuffer();
  const [anomalyAlert, setAnomalyAlert] = useState(null);
  const [escalate, setEscalate] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const lastScoredCount = useRef(0);
  const countdownRef = useRef(null);
  const intervalRef = useRef(null);

  // Accumulate GPS points as they arrive
  useEffect(() => {
    if (position) {
      addPoint(position);
    }
  }, [position, addPoint]);

  // Score trajectory periodically
  useEffect(() => {
    if (!AI_SERVICE_URL || !user || anomalyAlert) return;

    const currentCount = count();
    if (currentCount < 2) return; // AI needs at least 2 points
    if (currentCount - lastScoredCount.current < SCORE_EVERY_N_POINTS) return;

    lastScoredCount.current = currentCount;

    const points = getPoints();
    const allZones = [...(user.safeZones || []), ...sharedSafeZones];
    const safeZones = allZones.map((z) => ({
      latitude: z.lat,
      longitude: z.lng,
      label: z.label || "",
    }));

    fetch(`${AI_SERVICE_URL}/api/v1/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, safe_zones: safeZones }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("AI service error");
        return res.json();
      })
      .then((data) => {
        if (data.is_anomaly) {
          setAnomalyAlert({
            riskScore: data.risk_score,
            explanations: data.explanations || [],
          });
          startCheckinCountdown();
        }
      })
      .catch(() => {
        // AI service unavailable — fail silently, don't block user
      });
  }, [position]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCheckinCountdown = useCallback(() => {
    setCountdown(60);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setEscalate(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  /** User confirms they're safe — dismiss the anomaly alert */
  const confirmSafe = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearTimeout(countdownRef.current);
    setAnomalyAlert(null);
    setEscalate(false);
    setCountdown(null);
    clearBuffer();
    lastScoredCount.current = 0;
  }, [clearBuffer]);

  /** Reset escalation flag after an alert has been created */
  const resetEscalation = useCallback(() => {
    setEscalate(false);
    setAnomalyAlert(null);
    setCountdown(null);
    clearBuffer();
    lastScoredCount.current = 0;
  }, [clearBuffer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);

  return {
    anomalyAlert,   // null or { riskScore, explanations }
    escalate,       // true when countdown expired and no response
    countdown,      // seconds remaining or null
    confirmSafe,    // call to dismiss
    resetEscalation, // call after auto-creating the alert
    enabled: !!AI_SERVICE_URL,
  };
}
