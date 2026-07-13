/** Format a Firestore timestamp (or JS Date/ISO string) into relative time */
export function formatLastSeen(lastSeen) {
  if (!lastSeen) return "Never";
  // Firestore timestamps have a toDate() method
  const date = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
