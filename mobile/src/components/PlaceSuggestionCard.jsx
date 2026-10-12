import { useState } from "react";
import { ZONE_TYPES, getZoneIconSvgHtml } from "../utils/safeZoneTypes";
import "./PlaceSuggestionCard.css";

/**
 * Card shown when the AI detects the user has been at an unrecognised
 * location for a while. Prompts them to save it as a safe zone.
 */
export default function PlaceSuggestionCard({
  detectedPlace,
  onSave,
  onDismiss,
  saving,
  hasFamilyId,
}) {
  const [label, setLabel] = useState(detectedPlace?.suggestedLabel || "");
  const [type, setType] = useState("other");
  const [share, setShare] = useState(false);

  if (!detectedPlace) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    onSave(label.trim(), type, share);
  };

  return (
    <section className="home-card place-suggestion-card">
      <div className="place-suggestion-header">
        <div className="place-suggestion-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div>
          <h2 className="card-title place-suggestion-title">New Place Detected</h2>
          <p className="place-suggestion-dwell">
            You've been here for {detectedPlace.dwellMinutes} minute{detectedPlace.dwellMinutes !== 1 ? "s" : ""}.
            Save this as a safe zone?
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="place-suggestion-form">
        <input
          type="text"
          className="auth-input place-name-input"
          placeholder="Name this place..."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          autoFocus
        />

        {/* Zone type picker */}
        <div className="zone-type-grid">
          {ZONE_TYPES.map((zt) => (
            <button
              key={zt.value}
              type="button"
              className={`zone-type-chip ${type === zt.value ? "zone-type-chip--active" : ""}`}
              onClick={() => setType(zt.value)}
            >
              <span
                className="zone-chip-icon"
                dangerouslySetInnerHTML={{ __html: getZoneIconSvgHtml(zt.value) }}
              />
              {zt.label}
            </button>
          ))}
        </div>

        {/* Share toggle */}
        {hasFamilyId && (
          <label className="place-share-toggle">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
            />
            <span>Share with family</span>
          </label>
        )}

        <div className="place-suggestion-actions">
          <button type="button" className="btn-secondary" onClick={onDismiss} disabled={saving}>
            Not Now
          </button>
          <button type="submit" className="btn-primary place-save-btn" disabled={!label.trim() || saving}>
            {saving ? "Saving..." : "Save Place"}
          </button>
        </div>
      </form>
    </section>
  );
}
