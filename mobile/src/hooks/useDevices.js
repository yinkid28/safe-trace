import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Generate a device ID in the format ST-XXXX (4 random digits).
 */
function generateDeviceId() {
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `ST-${num}`;
}

/**
 * Generate a cryptographically random device key (32 hex characters).
 */
function generateDeviceKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a device key with a salt using SHA-256 (Web Crypto API).
 * Returns a hex string matching the server-side verification.
 */
async function hashDeviceKey(key, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Subscribe to hardware trackers paired to the current user.
 *
 * @param {string|null} userId - Current user's UID
 * @returns {{ devices, loading, pairDevice, unpairDevice }}
 */
export function useDevices(userId) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setDevices([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "devices"),
      where("pairedUserId", "==", userId)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setDevices(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userId]);

  /**
   * Create a new device pairing.
   *
   * Returns { deviceId, deviceKey } in plaintext so the user can
   * flash the key onto the ESP32.  The plaintext key is never stored —
   * only the salted SHA-256 hash is written to Firestore.
   */
  const pairDevice = async (label, uid, familyId) => {
    const deviceId = generateDeviceId();
    const deviceKey = generateDeviceKey();
    const keySalt = generateDeviceKey(); // reuse generator for random salt
    const keyHash = await hashDeviceKey(deviceKey, keySalt);

    await setDoc(doc(db, "devices", deviceId), {
      deviceId,
      keyHash,
      keySalt,
      pairedUserId: uid,
      familyId: familyId || null,
      label: label.trim(),
      batteryVoltage: null,
      satellites: null,
      lastSeen: null,
      status: "never_connected",
      createdAt: serverTimestamp(),
      createdBy: uid,
    });

    return { deviceId, deviceKey };
  };

  /**
   * Unpair (delete) a device.
   */
  const unpairDevice = async (deviceId) => {
    await deleteDoc(doc(db, "devices", deviceId));
  };

  return { devices, loading, pairDevice, unpairDevice };
}
