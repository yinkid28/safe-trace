import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { db } from "../config/firebase";
import { APP_VERSION } from "../config/version";
import "./UpdateBanner.css";

/**
 * Checks Firestore for a newer app version and shows an update prompt.
 * Only shows on native (Android) since web users always get the latest build.
 * Downloads the APK directly and opens the Android installer.
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function checkForUpdate() {
      try {
        const snap = await getDoc(doc(db, "config", "app"));
        if (!snap.exists()) return;

        const data = snap.data();
        const latest = data.latestVersion;

        if (!latest || latest === APP_VERSION) return;

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
    if (!update.downloadUrl || downloading) return;

    setDownloading(true);
    setProgress(0);

    try {
      // Download APK as blob
      const response = await fetch(update.downloadUrl);
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) setProgress(Math.round((received / total) * 100));
      }

      // Convert chunks to base64
      const blob = new Blob(chunks);
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      // Save to device storage
      const fileName = `SafeTrace-v${update.version}.apk`;
      const saved = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      // Open the APK to trigger Android installer
      const fileUri = saved.uri;
      window.open(fileUri, "_system");

      setProgress(100);
      // Dismiss the banner — the installer is now open
      setDismissed(true);
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback: open in browser
      window.open(update.downloadUrl, "_system");
      setDismissed(true);
    } finally {
      setDownloading(false);
    }
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

        {downloading && (
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="update-actions">
          {!update.required && !downloading && (
            <button type="button" className="update-btn-later" onClick={handleDismiss}>
              Later
            </button>
          )}
          <button
            type="button"
            className="update-btn-download"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? `Downloading... ${progress}%` : "Download & Install"}
          </button>
        </div>
      </div>
    </div>
  );
}
