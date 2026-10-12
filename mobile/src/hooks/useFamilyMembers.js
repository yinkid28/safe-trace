import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const STALE_CHECK_INTERVAL_MS = 60 * 1000; // re-evaluate every 60 seconds

/**
 * Convert a Firestore timestamp (or Date) to epoch ms.
 * Returns 0 if the value is missing or invalid.
 */
function toEpoch(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.toDate) return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  return 0;
}

/**
 * Subscribe to real-time location updates of family members.
 * Includes a `stale` flag on each member: true when lastSeen is
 * older than 10 minutes and phoneStatus is still "online" (indicates
 * the phone stopped reporting without a clean logout).
 *
 * @param {string|null} familyId - The user's family ID
 * @param {string} currentUserId - The current user's UID (to exclude from results)
 * @returns {{ members: Array, loading: boolean }}
 */
export function useFamilyMembers(familyId, currentUserId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const memberMapRef = useRef(new Map());

  useEffect(() => {
    if (!familyId || !currentUserId) {
      setMembers([]);
      memberMapRef.current = new Map();
      return;
    }

    let cancelled = false;
    const unsubscribes = [];
    const memberMap = new Map();
    memberMapRef.current = memberMap;

    // Compute stale flags and push to state
    function refreshWithStale() {
      if (cancelled) return;
      const now = Date.now();
      const list = Array.from(memberMap.values()).map((m) => {
        const lastSeenMs = toEpoch(m.lastSeen);
        const isStale =
          m.phoneStatus === "online" &&
          lastSeenMs > 0 &&
          now - lastSeenMs > STALE_THRESHOLD_MS;
        return { ...m, stale: isStale };
      });
      setMembers(list);
    }

    // Track per-member listeners so we can add/remove them as the
    // family members array changes in real time.
    const memberUnsubs = new Map();
    setLoading(true);

    function subscribeTo(uid) {
      if (memberUnsubs.has(uid)) return; // already listening
      const unsub = onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            memberMap.set(uid, {
              uid,
              name: data.name,
              lastLocation: data.lastLocation,
              lastSeen: data.lastSeen,
              phoneStatus: data.phoneStatus,
              lastLocationSource: data.lastLocationSource || "phone",
            });
          } else {
            memberMap.delete(uid);
          }
          refreshWithStale();
        },
        () => {
          memberMap.delete(uid);
          refreshWithStale();
        }
      );
      memberUnsubs.set(uid, unsub);
      unsubscribes.push(unsub);
    }

    // Listen to the family doc in real time so new members (from join
    // approvals) appear immediately without a page refresh.
    const familyUnsub = onSnapshot(
      doc(db, "families", familyId),
      (familySnap) => {
        if (cancelled || !familySnap.exists()) {
          setMembers([]);
          setLoading(false);
          return;
        }

        const familyData = familySnap.data();
        const memberIds = (familyData.members || []).filter(
          (id) => id !== currentUserId
        );

        // Unsubscribe from removed members
        for (const uid of memberUnsubs.keys()) {
          if (!memberIds.includes(uid)) {
            memberUnsubs.get(uid)();
            memberUnsubs.delete(uid);
            memberMap.delete(uid);
          }
        }

        if (memberIds.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }

        // Subscribe to any new members
        memberIds.forEach(subscribeTo);
        setLoading(false);
      },
      () => {
        // Family doc listener error
        setLoading(false);
      }
    );
    unsubscribes.push(familyUnsub);

    // Periodic stale check — re-evaluates based on elapsed time
    // (onSnapshot alone can't detect staleness because the doc
    // doesn't change when time passes)
    const staleInterval = setInterval(refreshWithStale, STALE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(staleInterval);
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [familyId, currentUserId]);

  return { members, loading };
}
