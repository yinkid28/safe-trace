/**
 * SafeTrace Full Deploy Script
 *
 * Bumps the version, builds the app, builds the APK,
 * uploads to Firebase Storage, updates Firestore, and deploys the dashboard.
 *
 * Usage:  node deploy.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const VERSION_FILE = path.join(ROOT, "mobile/src/config/version.js");

function run(cmd, cwd = ROOT) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Bump patch version
const content = fs.readFileSync(VERSION_FILE, "utf8");
const current = content.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1] || "1.0.0";
const parts = current.split(".").map(Number);
parts[2] = (parts[2] || 0) + 1;
const next = parts.join(".");
fs.writeFileSync(
  VERSION_FILE,
  content.replace(/APP_VERSION\s*=\s*"[^"]+"/, `APP_VERSION = "${next}"`),
  "utf8"
);
console.log(`\n=== Version bumped: ${current} → ${next} ===\n`);

// 2. Build web app
run("npm run build", path.join(ROOT, "mobile"));

// 3. Sync to Android
run("npx cap sync android", path.join(ROOT, "mobile"));

// 4. Build APK
const gradlew = path.join(ROOT, "mobile/android/gradlew.bat");
const androidDir = path.join(ROOT, "mobile/android");
run(`"${gradlew}" -p "${androidDir}" assembleDebug`);

// 5. Upload APK + update Firestore version
run("node upload-apk.js", path.join(ROOT, "firebase"));

// 6. Build dashboard and deploy to Firebase Hosting
run("npm run build", path.join(ROOT, "dashboard"));
const dashboardDistDir = path.join(ROOT, "dashboard/dist");
const publicDir = path.join(ROOT, "firebase/public");
// Clear old hosting files first
for (const file of fs.readdirSync(publicDir)) {
  const fp = path.join(publicDir, file);
  if (fs.statSync(fp).isDirectory()) {
    fs.rmSync(fp, { recursive: true });
  } else {
    fs.unlinkSync(fp);
  }
}
// Copy dashboard build output to hosting public folder
for (const file of fs.readdirSync(dashboardDistDir)) {
  const src = path.join(dashboardDistDir, file);
  const dest = path.join(publicDir, file);
  if (fs.statSync(src).isDirectory()) {
    execSync(`xcopy /E /Y /I "${src}" "${dest}"`, { stdio: "inherit" });
  } else {
    fs.copyFileSync(src, dest);
  }
}
run("npx firebase deploy --only hosting", path.join(ROOT, "firebase"));

console.log(`\n=== Deploy complete! v${next} is live ===`);
console.log("APK uploaded, Firestore updated, dashboard deployed.");
console.log("All users on older versions will see the update prompt.\n");
