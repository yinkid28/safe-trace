/* eslint-disable no-undef */
/**
 * Firebase Cloud Messaging service worker.
 *
 * Handles background push notifications when the app tab is not focused.
 * The Firebase config below must match your project — fill in the values
 * from Firebase Console > Project Settings > General.
 */
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);

// TODO: Replace these with your actual Firebase config values.
// They are public keys (same as in your .env), not secrets.
firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
});

var messaging = firebase.messaging();

// Background message handler (when app tab is hidden or closed)
messaging.onBackgroundMessage(function (payload) {
  var title = (payload.notification && payload.notification.title) || "SafeTrace Alert";
  var body = (payload.notification && payload.notification.body) || "You have a new alert";

  self.registration.showNotification(title, {
    body: body,
    icon: "/logo.png",
    data: payload.data || {},
    tag: (payload.data && payload.data.alertId) || "safetrace-alert",
    requireInteraction: true,
  });
});

// Notification click handler — open or focus the app
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ("focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow("/alerts");
    })
  );
});
