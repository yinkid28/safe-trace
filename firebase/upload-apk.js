const fs = require("fs");
const https = require("https");
const path = require("path");

const configPath = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".config/configstore/firebase-tools.json"
);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const refreshToken = config.tokens.refresh_token;
const clientId = config.tokens.client_id || "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const clientSecret = config.tokens.client_secret || "j9iVZfS8kkCEFUPaAeJV0sAi";

const BUCKET = "safetrace-ab950.firebasestorage.app";
const OBJECT_PATH = "downloads/SafeTrace.apk";
const APK_PATH = path.resolve(__dirname, "../mobile/android/app/build/outputs/apk/debug/app-debug.apk");

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const postData = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
    const req = https.request({
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data).access_token);
        } else {
          reject(new Error(`Token error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function uploadFile(accessToken) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(APK_PATH);
    const encodedPath = encodeURIComponent(OBJECT_PATH);
    const req = https.request({
      hostname: "storage.googleapis.com",
      path: `/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodedPath}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": fileBuffer.length,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          const obj = JSON.parse(data);
          const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodedPath}?alt=media`;
          console.log("Upload successful!");
          console.log("Download URL:", downloadUrl);
          resolve(downloadUrl);
        } else {
          reject(new Error(`Upload error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

(async () => {
  try {
    console.log("Getting access token...");
    const token = await getAccessToken();
    console.log("Uploading APK to Firebase Storage...");
    await uploadFile(token);
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();
