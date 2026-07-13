import { formatLastSeen } from "./formatTime";

/**
 * Rule-based "Where is X?" status formatter.
 * Takes a family member object from Firestore and returns a plain English status string.
 */
export function formatMemberStatus(member) {
  if (!member) return "No data available.";

  const name = member.name?.split(" ")[0] || "This person";

  // No location data at all
  if (!member.lastLocation) {
    return `${name} has no location data yet.`;
  }

  const { lat, lng, speed, heading } = member.lastLocation;
  const lastSeenStr = formatLastSeen(member.lastSeen);
  const coords = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  if (member.phoneStatus === "online") {
    let status = `${name} is online. Last update: ${lastSeenStr}.`;

    if (speed != null && speed > 1) {
      const kmh = Math.round(speed * 3.6);
      status += ` Moving at ~${kmh} km/h.`;
    } else {
      status += " Appears stationary.";
    }

    status += ` Location: ${coords}.`;
    return status;
  }

  // Offline
  return `${name} is offline. Last seen ${lastSeenStr} at ${coords}. Phone may be off or out of range.`;
}
