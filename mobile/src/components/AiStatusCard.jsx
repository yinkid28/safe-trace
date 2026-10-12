import { isInLearningPeriod } from "../hooks/useAnomalyDetection";
import "./AiStatusCard.css";

const LEARNING_DAYS = 7;

/**
 * Compute learning progress from user.createdAt.
 */
function getLearningProgress(user) {
  if (!user?.createdAt) return { progress: 0, daysElapsed: 0, daysLeft: LEARNING_DAYS };

  const createdMs =
    typeof user.createdAt.toMillis === "function"
      ? user.createdAt.toMillis()
      : user.createdAt.toDate
        ? user.createdAt.toDate().getTime()
        : typeof user.createdAt === "number"
          ? user.createdAt
          : 0;

  if (!createdMs) return { progress: 0, daysElapsed: 0, daysLeft: LEARNING_DAYS };

  const elapsedMs = Date.now() - createdMs;
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  const progress = Math.min(100, Math.round((elapsedDays / LEARNING_DAYS) * 100));
  const daysLeft = Math.max(0, Math.ceil(LEARNING_DAYS - elapsedDays));

  return { progress, daysElapsed: Math.floor(elapsedDays), daysLeft };
}

/**
 * Pick a milestone message based on elapsed days.
 */
function getMilestone(daysElapsed, placesCount) {
  if (daysElapsed < 1)
    return "I'll spend the next 7 days learning your movement patterns.";
  if (daysElapsed < 2)
    return "Day 1 complete! I've started tracking your regular locations.";
  if (daysElapsed < 4)
    return `Halfway there! I${placesCount > 0 ? `'ve registered ${placesCount} place${placesCount > 1 ? "s" : ""}` : "'m starting to see your patterns"}.`;
  if (daysElapsed < 6)
    return "Almost done! I've built a solid baseline of your movements.";
  return "Learning complete! Anomaly alerts are now active.";
}

/**
 * AI Status Card — replaces the old static "AI is Learning" card.
 *
 * Learning mode:  progress bar, day counter, milestone messages
 * Active mode:    compact "AI Active" card with optional soft insight
 */
export default function AiStatusCard({ user, latestInsight }) {
  if (!user || user.role === "agency_staff") return null;

  const learning = isInLearningPeriod(user);
  const { progress, daysElapsed, daysLeft } = getLearningProgress(user);
  const placesCount = (user.safeZones || []).length;

  // ===== Post-learning compact card =====
  if (!learning) {
    return (
      <section className="home-card ai-status-card ai-status-active">
        <div className="ai-status-header">
          <div className="ai-status-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ai-status-icon">
              <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
              <line x1="10" y1="22" x2="14" y2="22" />
              <line x1="9" y1="17" x2="15" y2="17" />
            </svg>
          </div>
          <span className="ai-status-title">SafeTrace AI Active</span>
          <span className="ai-active-badge">Monitoring</span>
        </div>

        {latestInsight ? (
          <p className="ai-status-insight">
            {latestInsight.explanations?.[0] || "I noticed slightly unusual movement — keeping watch."}
          </p>
        ) : (
          <p className="ai-status-insight ai-status-calm">
            Your movement patterns look normal. No concerns detected.
          </p>
        )}
      </section>
    );
  }

  // ===== Learning mode =====
  const milestone = getMilestone(daysElapsed, placesCount);

  return (
    <section className="home-card ai-status-card ai-status-learning">
      <div className="ai-status-header">
        <div className="ai-status-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ai-status-icon">
            <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
            <line x1="10" y1="22" x2="14" y2="22" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
        </div>
        <span className="ai-status-title">SafeTrace AI</span>
      </div>

      <p className="ai-learning-subtitle">
        Day {Math.min(daysElapsed + 1, LEARNING_DAYS)} of {LEARNING_DAYS} — Learning your patterns
      </p>

      {/* Progress bar */}
      <div className="ai-progress-track">
        <div className="ai-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Stats row */}
      <div className="ai-stats-row">
        <span className="ai-stat-pill">
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
          {placesCount} place{placesCount !== 1 ? "s" : ""} saved
        </span>
        <span className="ai-stat-pill">
          {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left` : "Complete"}
        </span>
      </div>

      {/* Milestone message */}
      <p className="ai-milestone">{milestone}</p>
    </section>
  );
}
