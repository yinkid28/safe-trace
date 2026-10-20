import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { db } from "../config/firebase";
import { APP_VERSION } from "../config/version";
import "./UpdateBanner.css";

/**
 * Checks Firestore for a newer app version and shows an update prompt.
 * Only shows on native (Android) since web users always get the latest build.
 *
 * Opens the APK download URL in the system browser so Android's native
 * download manager handles the download and prompts for installation.
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function checkForUpdate() {
      try {
        const snap = await getDoc(doc(db, "config", "app"));
        if (!snap.exists()) return;

        const data = snap.data();
        const latest = data.latestVersion;

        if (!latest || latest === APP_VERSION) return;

        // If user already downloaded this version, don't nag again
        const alreadyDownloaded = localStorage.getItem("safetrace_downloaded_version");
        if (alreadyDownloaded === latest) return;

        setUpdate({
          version: latest,
          downloadUrl: data.downloadUrl || null,
          message: data.updateMessage || "A new version of SafeTrace is available.",
          required: data.required || false,
        });
      } catch (_) {
        // Network/permission error — don't block the app
      }
    }

    checkForUpdate();
  }, []);

  if (!update || dismissed) return null;

  const handleDismiss = () => {
    if (update.required) return;
    setDismissed(true);
  };

  const handleDownload = async () => {
    if (!update.downloadUrl) return;

    // Open in the external system browser (Chrome) via Capacitor Browser plugin.
    // Chrome's download manager will download the APK and the user taps the
    // notification to install it.
    try {
      await Browser.open({ url: update.downloadUrl, windowName: "_system" });
    } catch {
      // Fallback if Browser plugin fails
      window.location.href = update.downloadUrl;
    }

    localStorage.setItem("safetrace_downloaded_version", update.version);
    setDismissed(true);
  };

  return (
    <div className="update-banner-overlay">
      <div className="update-banner">
        <div className="update-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <h3 className="update-title">Update Available</h3>
        <p className="update-message">{update.message}</p>
        <p className="update-version">v{APP_VERSION} &rarr; v{update.version}</p>

        <div className="update-actions">
          {!update.required && (
            <button type="button" className="update-btn-later" onClick={handleDismiss}>
              Later
            </button>
          )}
          <button
            type="button"
            className="update-btn-download"
            onClick={handleDownload}
          >
            Download & Install
          </button>
        </div>
      </div>
    </div>
  );
}
