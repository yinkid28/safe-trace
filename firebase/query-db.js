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

function firestoreGet(token, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`GET ${path} → ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// Convert Firestore document fields to readable format
function simplify(doc) {
  if (!doc.fields) return { _id: doc.name?.split("/").pop(), _empty: true };
  const out = { _id: doc.name?.split("/").pop() };
  for (const [key, val] of Object.entries(doc.fields)) {
    if (val.stringValue !== undefined) out[key] = val.stringValue;
    else if (val.integerValue !== undefined) out[key] = Number(val.integerValue);
    else if (val.booleanValue !== undefined) out[key] = val.booleanValue;
    else if (val.nullValue !== undefined) out[key] = null;
    else if (val.timestampValue !== undefined) out[key] = val.timestampValue;
    else if (val.mapValue) {
      out[key] = {};
      if (val.mapValue.fields) {
        for (const [k2, v2] of Object.entries(val.mapValue.fields)) {
          out[key][k2] = v2.stringValue || v2.integerValue || v2.doubleValue || v2.booleanValue || v2.nullValue || JSON.stringify(v2);
        }
      }
    }
    else if (val.arrayValue) {
      out[key] = (val.arrayValue.values || []).map(v =>
        v.stringValue || v.mapValue || v.integerValue || JSON.stringify(v)
      );
    }
    else out[key] = JSON.stringify(val);
  }
  return out;
}

(async () => {
  try {
    const token = await getAccessToken();

    console.log("=== USERS ===");
    const users = await firestoreGet(token, "users");
    if (users.documents) {
      users.documents.forEach(doc => {
        const u = simplify(doc);
        console.log(`\n  UID: ${u._id}`);
        console.log(`  Name: ${u.name}`);
        console.log(`  Email: ${u.email}`);
        console.log(`  Role: ${u.role}`);
        console.log(`  FamilyId: ${u.familyId}`);
        console.log(`  PhoneStatus: ${u.phoneStatus}`);
      });
    } else {
      console.log("  (no user documents found)");
    }

    console.log("\n=== FAMILIES ===");
    const families = await firestoreGet(token, "families");
    if (families.documents) {
      families.documents.forEach(doc => {
        const f = simplify(doc);
        console.log(`\n  FamilyId: ${f._id}`);
        console.log(`  Name: ${f.name}`);
        console.log(`  AdminUserId: ${f.adminUserId}`);
        console.log(`  Members: ${JSON.stringify(f.members)}`);
        console.log(`  AgencyId: ${f.agencyId}`);
      });
    } else {
      console.log("  (no family documents found)");
    }

    console.log("\n=== AGENCIES ===");
    const agencies = await firestoreGet(token, "agencies");
    if (agencies.documents) {
      agencies.documents.forEach(doc => {
        const a = simplify(doc);
        console.log(`\n  AgencyId: ${a._id}`);
        console.log(`  Name: ${a.name}`);
        console.log(`  Status: ${a.status}`);
      });
    } else {
      console.log("  (no agency documents found)");
    }

  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
})();
