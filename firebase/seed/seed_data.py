"""Test data definitions for SafeTrace Firestore seeding.

All coordinates use real Lagos landmarks matching ai-service/app/data/simulate.py.
Names and locations match dashboard/FRONTEND_SPEC.md mock data.
"""

# --- Lagos landmarks (must match ai-service/app/data/simulate.py) ---

YABATECH_CAMPUS = {"lat": 6.5158, "lng": 3.3775}
SABO_YABA = {"lat": 6.5095, "lng": 3.3810}
TEJUOSHO_MARKET = {"lat": 6.5190, "lng": 3.3680}
UNILAG = {"lat": 6.5158, "lng": 3.3985}
JIBOWU = {"lat": 6.5250, "lng": 3.3700}

DEFAULT_PASSWORD = "Test1234!"

# --- Agency ---

AGENCY = {
    "doc_id": "agency_yaba",
    "name": "Yaba Security Services",
    "phone": "+2348001234567",
    "address": "15 Commercial Avenue, Yaba, Lagos",
}

# --- Users ---
# Keys become Firestore doc IDs after Auth UID assignment.
# 'email' is used for Firebase Auth account creation.

USERS = [
    {
        "key": "adeyinka",
        "name": "Adeyinka Ogunleye",
        "email": "adeyinka.ogunleye@safetrace.test",
        "phone": "+2348012345678",
        "role": "family_admin",
        "family_key": "ogunleye",
        "safe_zones": [
            {"lat": YABATECH_CAMPUS["lat"], "lng": YABATECH_CAMPUS["lng"], "label": "Yabatech"},
            {"lat": SABO_YABA["lat"], "lng": SABO_YABA["lng"], "label": "Sabo"},
        ],
    },
    {
        "key": "funke",
        "name": "Funke Ogunleye",
        "email": "funke.ogunleye@safetrace.test",
        "phone": "+2348012345679",
        "role": "user",
        "family_key": "ogunleye",
        "safe_zones": [
            {"lat": YABATECH_CAMPUS["lat"], "lng": YABATECH_CAMPUS["lng"], "label": "Yabatech"},
            {"lat": TEJUOSHO_MARKET["lat"], "lng": TEJUOSHO_MARKET["lng"], "label": "Tejuosho"},
        ],
    },
    {
        "key": "tola",
        "name": "Tola Adeniyi",
        "email": "tola.adeniyi@safetrace.test",
        "phone": "+2348023456780",
        "role": "family_admin",
        "family_key": "adeniyi",
        "safe_zones": [
            {"lat": UNILAG["lat"], "lng": UNILAG["lng"], "label": "UNILAG"},
            {"lat": SABO_YABA["lat"], "lng": SABO_YABA["lng"], "label": "Sabo"},
        ],
    },
    {
        "key": "chidi",
        "name": "Chidi Nwankwo",
        "email": "chidi.nwankwo@safetrace.test",
        "phone": "+2348023456781",
        "role": "user",
        "family_key": "adeniyi",
        "safe_zones": [
            {"lat": JIBOWU["lat"], "lng": JIBOWU["lng"], "label": "Jibowu"},
        ],
    },
    {
        "key": "amaka",
        "name": "Amaka Eze",
        "email": "amaka.eze@safetrace.test",
        "phone": "+2348023456782",
        "role": "user",
        "family_key": "adeniyi",
        "safe_zones": [
            {"lat": UNILAG["lat"], "lng": UNILAG["lng"], "label": "UNILAG"},
        ],
    },
    {
        "key": "bayo",
        "name": "Bayo Oladele",
        "email": "officer.bayo@safetrace.test",
        "phone": "+2348034567890",
        "role": "agency_staff",
        "family_key": None,
        "safe_zones": [],
    },
    {
        "key": "ngozi",
        "name": "Ngozi Eze",
        "email": "officer.ngozi@safetrace.test",
        "phone": "+2348034567891",
        "role": "agency_staff",
        "family_key": None,
        "safe_zones": [],
    },
]

# --- Families ---

FAMILIES = [
    {
        "doc_id": "family_ogunleye",
        "key": "ogunleye",
        "name": "Ogunleye Family",
        "admin_key": "adeyinka",
        "member_keys": ["adeyinka", "funke"],
    },
    {
        "doc_id": "family_adeniyi",
        "key": "adeniyi",
        "name": "Adeniyi Family",
        "admin_key": "tola",
        "member_keys": ["tola", "chidi", "amaka"],
    },
]

# --- Alerts ---
# user_key / family_key are resolved to UIDs / doc IDs at seed time.

ALERTS = [
    {
        "user_key": "adeyinka",
        "type": "panic",
        "status": "new",
        "location": {**SABO_YABA, "speed": 62.0, "heading": 45.0},
        "location_name": "Sabo, Yaba",
        "risk_score": 0.82,
        "explanations": [
            "Very high speed (62 km/h) — vehicle movement",
            "Movement during high-risk hours (10pm-5am)",
            "Far from safe zones (4.2 km away)",
        ],
        "escalated": True,
        "timeline_events": [
            "Panic triggered",
            "Evidence uploaded (2 photos)",
            "Phone went offline",
            "Alert sent to family",
            "Family escalated to agency",
        ],
    },
    {
        "user_key": "tola",
        "type": "ai_anomaly",
        "status": "acknowledged",
        "location": {**TEJUOSHO_MARKET, "speed": 38.0, "heading": 190.0},
        "location_name": "Tejuosho, Yaba",
        "risk_score": 0.71,
        "explanations": [
            "Unusual speed detected (38 km/h in pedestrian zone)",
            "Route deviation from normal pattern",
        ],
        "escalated": False,
        "timeline_events": [
            "AI anomaly detected",
            "Alert sent to family",
            "Acknowledged by agency staff",
        ],
    },
    {
        "user_key": "chidi",
        "type": "offline",
        "status": "new",
        "location": {**JIBOWU, "speed": 0.0, "heading": 0.0},
        "location_name": "Jibowu, Yaba",
        "risk_score": None,
        "explanations": [],
        "escalated": False,
        "timeline_events": [
            "Phone went offline",
            "Alert sent to family",
        ],
    },
    {
        "user_key": "funke",
        "type": "checkin",
        "status": "resolved",
        "location": {**YABATECH_CAMPUS, "speed": 4.5, "heading": 120.0},
        "location_name": "Yabatech Campus",
        "risk_score": None,
        "explanations": [],
        "escalated": False,
        "timeline_events": [
            "Check-in requested",
            "User confirmed safe",
            "Alert resolved",
        ],
    },
]
