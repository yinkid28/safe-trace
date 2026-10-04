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

const PROJECT_ID = "safetrace-ab950";
const BASE = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// The 28 account to remove from family
const ACCOUNT_28_UID = "QbssjNZ7NOZjL7dUEeO7oMrw2E62";
const FAMILY_ID = "W7rjhiI9YQfdhz0UAkQ0";
// The admin (1024 account) stays as sole member
const ADMIN_UID = "CteGjX58RvUo2lC6c3BICn1QVTH2";

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
        if (res.statusCode === 200) resolve(JSON.parse(data).access_token);
        else reject(new Error(`Token error ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function firestorePatch(token, docPath, fields, fieldMask) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields });
    const maskParam = fieldMask.map(f => `updateMask.fieldPaths=${f}`).join("&");
    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `${BASE}/${docPath}?${maskParam}`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`PATCH ${docPath} → ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const token = await getAccessToken();

    // 1. Remove 28 account from the family members array (keep only admin)
    console.log("1. Updating family members to remove 28 account...");
    await firestorePatch(token, `families/${FAMILY_ID}`, {
      members: {
        arrayValue: {
          values: [{ stringValue: ADMIN_UID }]
        }
      }
    }, ["members"]);
    console.log("   Done — family now has only the admin (1024 account).");

    // 2. Clear the 28 account's familyId so it's no longer linked
    console.log("2. Clearing familyId on the 28 account...");
    await firestorePatch(token, `users/${ACCOUNT_28_UID}`, {
      familyId: { nullValue: null }
    }, ["familyId"]);
    console.log("   Done — 28 account is no longer in any family.");

    console.log("\nCleanup complete!");
    console.log("- Family W7rjhi... now has 1 member: your 1024 account (admin)");
    console.log("- Account adeyinkaadedayo28 is unlinked (familyId = null)");

  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();
