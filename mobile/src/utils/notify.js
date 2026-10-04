const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || "";

/**
 * Fire-and-forget push notification to family members and agency staff.
 * Called after an alert document has been written to Firestore.
 *
 * @param {{ alertId: string, alertType: string, userName: string, familyId: string, agencyId: string, locationName: string }} params
 */
export function sendNotification({ alertId, alertType, userName, familyId, agencyId, locationName }) {
  if (!AI_SERVICE_URL) return;

  fetch(`${AI_SERVICE_URL}/api/v1/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      alertId,
      alertType,
      userName: userName || "Someone",
      familyId: familyId || "",
      agencyId: agencyId || "",
      locationName: locationName || "Unknown location",
    }),
  }).catch(() => {
    // Best effort — the alert already exists in Firestore
  });
}
