import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../config/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

/**
 * Register for push notifications and save the FCM token to Firestore.
 *
 * - Web: Uses Firebase Cloud Messaging JS SDK + service worker
 * - Native (Android): Uses @capacitor/push-notifications plugin
 *
 * @param {object|null} user - Current user from useAuth
 */
export function usePushNotifications(user) {
  const tokenRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    async function register() {
      if (Capacitor.isNativePlatform()) {
        await registerNative(user.uid, cancelled);
      } else {
        await registerWeb(user.uid, cancelled);
      }
    }

    register();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function registerWeb(uid, cancelled) {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

      const permission = await Notification.requestPermission();
      if (permission !== "granted" || cancelled) return;

      // Dynamic import to avoid bundling messaging when unused
      const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
      const { default: app } = await import("../config/firebase");

      const messaging = getMessaging(app);

      const swRegistration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY || undefined,
        serviceWorkerRegistration: swRegistration,
      });

      if (cancelled || !token) return;

      tokenRef.current = token;
      await updateDoc(doc(db, "users", uid), {
        fcmTokens: arrayUnion(token),
      });

      // Foreground message listener
      const unsubscribe = onMessage(messaging, (payload) => {
        if (Notification.permission === "granted") {
          new Notification(payload.notification?.title || "SafeTrace", {
            body: payload.notification?.body || "",
            icon: "/logo.png",
            data: payload.data,
          });
        }
      });

      cleanupRef.current = unsubscribe;
    } catch (err) {
      console.warn("FCM web registration failed:", err);
    }
  }

  async function registerNative(uid, cancelled) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== "granted" || cancelled) return;

      await PushNotifications.register();

      const registrationListener = await PushNotifications.addListener(
        "registration",
        async (registration) => {
          if (cancelled) return;
          const token = registration.value;
          tokenRef.current = token;

          try {
            await updateDoc(doc(db, "users", uid), {
              fcmTokens: arrayUnion(token),
            });
          } catch (_) {
            // Best effort
          }
        }
      );

      const errorListener = await PushNotifications.addListener(
        "registrationError",
        (error) => {
          console.warn("Native push registration error:", error);
        }
      );

      cleanupRef.current = () => {
        registrationListener.remove();
        errorListener.remove();
      };
    } catch (err) {
      console.warn("Native push registration failed:", err);
    }
  }

  // Remove token from Firestore (call on logout)
  async function removeToken(uid) {
    if (tokenRef.current && uid) {
      try {
        await updateDoc(doc(db, "users", uid), {
          fcmTokens: arrayRemove(tokenRef.current),
        });
      } catch (_) {
        // Best effort
      }
      tokenRef.current = null;
    }
  }

  return { removeToken };
}
