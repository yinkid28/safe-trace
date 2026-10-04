import { useEffect, useRef } from "react";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { sendNotification } from "../utils/notify";

const DEFAULT_AGENCY_ID = "agency_yaba";

/**
 * Watch family members for stale transitions and auto-create
 * offline alerts with dedup. A member is "stale" when their
 * lastSeen is >10 minutes old but phoneStatus is still "online",
 * meaning the phone stopped reporting without a clean logout.
 *
 * @param {Array} members - Family member list from useFamilyMembers (includes `stale` flag)
 * @param {object|null} user - Current authenticated user
 */
export function useOfflineDetection(members, user) {
  // Track which UIDs we've already created an alert for this session,
  // so we don't re-query Firestore on every render.
  const alertedRef = useRef(new Set());

  useEffect(() => {
    if (!user?.uid || !user?.familyId || members.length === 0) return;

    const staleMembers = members.filter((m) => m.stale === true);
    if (staleMembers.length === 0) return;

    let cancelled = false;

    async function createOfflineAlerts() {
      for (const member of staleMembers) {
        if (cancelled) break;

        // Already alerted in this session — skip
        if (alertedRef.current.has(member.uid)) continue;

        try {
          // Dedup: check if an active offline alert already exists for this member
          const q = query(
            collection(db, "alerts"),
            where("userId", "==", member.uid),
            where("type", "==", "offline"),
            where("status", "in", ["new", "acknowledged"])
          );
          const snap = await getDocs(q);
          if (cancelled) break;

          if (!snap.empty) {
            // Active offline alert already exists — mark as alerted so we don't re-query
            alertedRef.current.add(member.uid);
            continue;
          }

          // Create the offline alert
          const alertRef = doc(collection(db, "alerts"));
          const loc = member.lastLocation || { lat: 0, lng: 0 };

          await setDoc(alertRef, {
            userId: member.uid,
            userName: member.name || "Unknown",
            familyId: user.familyId,
            agencyId: user.directAgencyId || DEFAULT_AGENCY_ID,
            type: "offline",
            status: "new",
            createdAt: new Date(),
            lastKnownLocation: loc,
            locationName:
              loc.lat && loc.lng
                ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
                : "Unknown",
            riskScore: 0.6,
            explanations: [
              "Phone went offline — no location updates for over 10 minutes",
            ],
            evidenceUrls: [],
            escalated: false,
            trajectory: [],
            timeline: [
              { event: "Phone offline detected", timestamp: new Date() },
            ],
            notes: [],
          });

          sendNotification({
            alertId: alertRef.id,
            alertType: "offline",
            userName: member.name || "Unknown",
            familyId: user.familyId,
            agencyId: user.directAgencyId || DEFAULT_AGENCY_ID,
            locationName:
              loc.lat && loc.lng
                ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
                : "Unknown",
          });

          alertedRef.current.add(member.uid);
        } catch (_) {
          // Alert creation failed — will retry on next stale check
        }
      }
    }

    createOfflineAlerts();

    return () => {
      cancelled = true;
    };
  }, [members, user]);

  // When a member comes back online, remove them from the alerted set
  // so a future offline event can trigger a new alert.
  useEffect(() => {
    if (members.length === 0) return;

    for (const member of members) {
      if (!member.stale && alertedRef.current.has(member.uid)) {
        alertedRef.current.delete(member.uid);
      }
    }
  }, [members]);
}
