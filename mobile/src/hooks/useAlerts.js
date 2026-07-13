import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Real-time subscription to alerts for a given family.
 * Returns { alerts, loading } where alerts is an array sorted by createdAt desc.
 */
export function useAlerts(familyId) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "alerts"),
      where("familyId", "==", familyId),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAlerts(items);
        setLoading(false);
      },
      () => {
        // On error, stop loading but keep whatever we had
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [familyId]);

  return { alerts, loading };
}
