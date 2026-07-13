import { useRef, useCallback } from "react";

const MAX_POINTS = 20;

/**
 * Accumulates GPS points over time from LocationContext for AI scoring.
 * Keeps a rolling window of the most recent MAX_POINTS entries.
 */
export function useTrajectoryBuffer() {
  const bufferRef = useRef([]);

  const addPoint = useCallback((position) => {
    if (!position?.lat || !position?.lng) return;

    const point = {
      latitude: position.lat,
      longitude: position.lng,
      timestamp: Date.now() / 1000, // Unix seconds as expected by AI service
    };

    bufferRef.current = [...bufferRef.current, point].slice(-MAX_POINTS);
  }, []);

  const getPoints = useCallback(() => bufferRef.current, []);

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
  }, []);

  const count = useCallback(() => bufferRef.current.length, []);

  return { addPoint, getPoints, clearBuffer, count };
}
