import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
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

    async function setup() {
      setLoading(true);

      try {
        // Fetch the family doc to get the members array
        const familySnap = await getDoc(doc(db, "families", familyId));
        if (cancelled || !familySnap.exists()) {
          setLoading(false);
          return;
        }

        const familyData = familySnap.data();
        const memberIds = (familyData.members || []).filter(
          (id) => id !== currentUserId
        );

        if (memberIds.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }

        // Set up a real-time listener for each member
        memberIds.forEach((uid) => {
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
              // On error, remove this member from the map
              memberMap.delete(uid);
              refreshWithStale();
            }
          );

          unsubscribes.push(unsub);
        });
      } catch (_) {
        // Failed to fetch family doc
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setup();

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
