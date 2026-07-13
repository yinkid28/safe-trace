import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Subscribe to real-time location updates of family members.
 * @param {string|null} familyId - The user's family ID
 * @param {string} currentUserId - The current user's UID (to exclude from results)
 * @returns {{ members: Array, loading: boolean }}
 */
export function useFamilyMembers(familyId, currentUserId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!familyId || !currentUserId) {
      setMembers([]);
      return;
    }

    let cancelled = false;
    const unsubscribes = [];

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
        const memberMap = new Map();

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
                });
              } else {
                memberMap.delete(uid);
              }

              if (!cancelled) {
                setMembers(Array.from(memberMap.values()));
              }
            },
            () => {
              // On error, remove this member from the map
              memberMap.delete(uid);
              if (!cancelled) {
                setMembers(Array.from(memberMap.values()));
              }
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

    return () => {
      cancelled = true;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [familyId, currentUserId]);

  return { members, loading };
}
