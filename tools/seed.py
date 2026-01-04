import os
import json
import random
import string
import time
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = os.getenv("SEED_BASE_URL", "http://localhost:8000").rstrip("/")

# requested defaults
BUCHAREST_USERS = int(os.getenv("SEED_BUCHAREST_USERS", "50"))
REST_USERS      = int(os.getenv("SEED_REST_USERS", "200"))

# activities per user
ACT_MIN = int(os.getenv("SEED_ACT_MIN", "0"))
ACT_MAX = int(os.getenv("SEED_ACT_MAX", "2"))

# run id tag used to identify + delete the seeded users later
RUN_ID = os.getenv("SEED_RUN_ID", time.strftime("SEED_%Y%m%dT%H%M%S"))
TAG = f"__FAKE__{RUN_ID}"
LEDGER_PATH = os.getenv("SEED_LEDGER", f"seed_ledger_{RUN_ID}.json")

# throttle to avoid hammering your server (seconds)
SLEEP = float(os.getenv("SEED_SLEEP", "0.01"))

random.seed(int(os.getenv("SEED_RAND", "123")))

# activity settings
JOIN_MIN = int(os.getenv("SEED_JOIN_MIN", "5"))
JOIN_MAX = int(os.getenv("SEED_JOIN_MAX", "10"))
JOIN_RADIUS_MIN_KM = float(os.getenv("SEED_JOIN_RADIUS_MIN_KM", "0"))
JOIN_RADIUS_MAX_KM = float(os.getenv("SEED_JOIN_RADIUS_MAX_KM", "34"))

# city coords (approx) + jitter later
CITIES = {
    "Bucharest": (44.4268, 26.1025),
    "Cluj-Napoca": (46.7712, 23.6236),
    "Timișoara": (45.7489, 21.2087),
    "Iași": (47.1585, 27.6014),
    "Constanța": (44.1598, 28.6348),
    "Brașov": (45.6579, 25.6012),
    "Craiova": (44.3302, 23.7949),
    "Galați": (45.4353, 28.0080),
    "Ploiești": (44.9366, 26.0129),
    "Oradea": (47.0465, 21.9189),
    "Sibiu": (45.7936, 24.1213),
    "Arad": (46.1866, 21.3123),
    "Pitești": (44.8565, 24.8692),
    "Bacău": (46.5670, 26.9146),
    "Târgu Mureș": (46.5425, 24.5575),
    "Râmnicu Vâlcea": (45.1, 24.3666),

    "Alba Iulia": (46.0733, 23.5805),
    "Alexandria": (43.9686, 25.3328),
    "Baia Mare": (47.6592, 23.5819),
    "Bistrița": (47.1332, 24.4985),
    "Botoșani": (47.7406, 26.6635),
    "Brăila": (45.2692, 27.9575),
    "Buzău": (45.1516, 26.8165),
    "Călărași": (44.1925, 27.3275),
    "Deva": (45.8762, 22.9056),
    "Drobeta-Turnu Severin": (44.6269, 22.6567),
    "Focșani": (45.6960, 27.1824),
    "Giurgiu": (43.9037, 25.9699),
    "Miercurea Ciuc": (46.3606, 25.8015),
    "Piatra Neamț": (46.9283, 26.3706),
    "Reșița": (45.3008, 21.8892),
    "Satu Mare": (47.79, 22.885),
    "Sfântu Gheorghe": (45.8604, 25.7876),
    "Slobozia": (44.5638, 27.3658),
    "Slatina": (44.4304, 24.3636),
    "Suceava": (47.6444, 26.2522),
    "Târgoviște": (44.9258, 25.4567),
    "Târgu Jiu": (45.0347, 23.2721),
    "Tulcea": (45.1794, 28.8033),
    "Vaslui": (46.6382, 27.7303),
    "Zalău": (47.1812, 23.0564),

    "Mediaș": (46.1622, 24.3510),
    "Turda": (46.5670, 23.7833),
    "Dej": (47.1433, 23.8644),
    "Lugoj": (45.6886, 21.9031),
    "Sighetu Marmației": (47.9269, 23.8864),
    "Onești": (46.2589, 26.7628),
    "Pașcani": (47.2458, 26.7219),
    "Mangalia": (43.8167, 28.5833),
    "Năvodari": (44.3211, 28.6111),
    "Petroșani": (45.4111, 23.3739),
    "Hunedoara": (45.7500, 22.9000),
    "Roman": (46.93, 26.93),
    "Bârlad": (46.2300, 27.6700),
    "Caracal": (44.1100, 24.3400),
    "Oltenița": (44.0800, 26.6300),
    "Sighișoara": (46.2197, 24.7964),
    "Făgăraș": (45.8416, 24.9731),
    "Câmpulung": (45.2683, 25.0436),
    "Caransebeș": (45.4214, 22.2194),
    "Fetești": (44.4150, 27.8250),

    "Viscri": (46.0550, 25.0886),
    "Biertan": (46.1350, 24.5214),
    "Săpânța": (47.9714, 23.6953),
    "Bran": (45.5153, 25.3672),
    "Corund": (46.4714, 25.1864),
    "Rășinari": (45.7083, 24.0675),
    "Fundata": (45.4386, 25.2814),
    "Șirnea": (45.4678, 25.2611),
    "Moieciu": (45.5019, 25.3347),
    "Arieșeni": (46.4764, 22.7561),
    "Vama Veche": (43.7500, 28.5700),
    "2 Mai": (43.7800, 28.5800),
    "Costinești": (43.9500, 28.6300),
    "Sinaia": (45.3500, 25.5500),
    "Predeal": (45.5000, 25.5700),
    "Busteni": (45.4100, 25.5300),
    "Sovata": (46.5900, 25.0700),
    "Vatra Dornei": (47.3400, 25.3500),
    "Gura Humorului": (47.5500, 25.8800),
    "Borșa": (47.6500, 24.6600),
    "Săliște": (45.7936, 23.8864),
    "Poiana Brașov": (45.5900, 25.5500),
    "Eforie Nord": (44.0600, 28.6300),
    "Gura Portiței": (44.6800, 29.0000),
}

REST_CITY_NAMES = [c for c in CITIES.keys() if c != "Bucharest"]

CATEGORIES = [
    "sport", "food", "games", "volunteer", "other"
]

TITLES = [
    "Cafea și vorbă", "Sesiune de studiu", "Alergare", "Seara cu jocuri de societate", "Muzică live",
    "Ieșit la mâncare", "Expediție pe munte", "Plimbare prin oraș", "Tehnologie", "Hai la sală"
]

DESCRIPTIONS = [
    "Hai să cunoaștem oameni noi și să ne distrăm!",
    "Ieșim prin oraș ca să socializăm.",
    "Poți aduce un prieten dacă vrei.",
    "Deschis pentru oricine, atmosferă prietenoasă.",
    "Hai să explorăm împreună!"
]


def rands(n=6) -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def jitter_latlon(lat: float, lon: float, km: float = 2.0) -> tuple[float, float]:
    # rough jitter: 1 deg lat ~ 111km, lon scale depends on latitude
    dlat = (random.uniform(-km, km) / 111.0)
    dlon = (random.uniform(-km, km) / (111.0 * max(0.2, abs(__import__("math").cos(lat * 3.14159 / 180)))))
    return lat + dlat, lon + dlon


def post(path: str, payload: dict, token: str | None = None) -> requests.Response:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{BASE_URL}{path}", json=payload, headers=headers, timeout=30)
    return r


def extract_token(login_json: dict) -> str | None:
    # your auth/login uses access_token
    return login_json.get("access_token")


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def get_weighted_iso_date():
    options = [
        (2025, 7), (2025, 8), (2025, 9), (2025, 10),
        (2025, 11), (2025, 12), (2026, 1)
    ]
    weights = [0.18, 0.13, 0.11, 0.1, 0.09, 0.19, 0.31]

    year, month = random.choices(options, weights=weights, k=1)[0]

    day = random.randint(1, 28)
    hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)

    dt = datetime(year, month, day, hour, minute, second)
    return iso(dt)

def create_user_and_login(session, email, password, city):
    register_payload = {
        "name": f"User {city}",
        "email": email,
        "bio": f"Fake user for seeding ({city})",
        "interests": ["sports", "coffee", "music", "tech"],
        "visibility_radius_km": 10,
        "password": password
    }

    # REGISTER
    r = session.post(
        f"{BASE_URL}/api/auth/register",
        json=register_payload,
        timeout=30
    )

    if r.status_code not in (200, 201):
        print(f"[!] register failed {email}: {r.status_code}")
        return None

    # LOGIN
    l = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30
    )

    if l.status_code not in (200, 201):
        print(f"[!] login failed {email}")
        return None

    return l.json().get("access_token")



def create_activity(session: requests.Session, token: str, lat: float, lon: float):
    start = datetime.now(timezone.utc) + timedelta(days=random.randint(0, 14), hours=random.randint(0, 23))
    end = start + timedelta(hours=random.randint(1, 4))

    payload = {
        "title": random.choice(TITLES),
        "description": random.choice(DESCRIPTIONS),
        "category": random.choice(CATEGORIES),
        "start_time": iso(start),
        "end_time": iso(end),
        "latitude": lat,
        "longitude": lon,
        "max_people": random.randint(5, 30),
        "is_public": True,
    }
    # activities router is typically included as /activities in main.py
    r = session.post(f"{BASE_URL}/api/activities/", json=payload, headers={"Authorization": f"Bearer {token}"}, timeout=30)

    return r.status_code in (200, 201)

def get_nearby_activities(session: requests.Session, token: str, lat: float, lon: float, radius_km: float):
    r = session.get(
        f"{BASE_URL}/api/activities/nearby",
        params={"latitude": lat, "longitude": lon, "radius_km": radius_km},
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30,
    )
    if r.status_code != 200:
        return []
    return r.json()


def join_activity(session: requests.Session, token: str, activity_id: int) -> dict | None:
    r = session.post(
        f"{BASE_URL}/api/participations/",
        json={"activity_id": activity_id},
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30,
    )
    if r.status_code not in (200, 201):
        return None
    return r.json()  # contains: id, activity_id, user_id, status, joined_at

def get_me(session: requests.Session, token: str) -> dict | None:
    r = session.get(
        f"{BASE_URL}/api/users/me",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30,
    )
    return r.json() if r.status_code == 200 else None


def get_activity(session: requests.Session, token: str, activity_id: int) -> dict | None:
    r = session.get(
        f"{BASE_URL}/api/activities/{activity_id}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30,
    )
    return r.json() if r.status_code == 200 else None


def accept_participation(session: requests.Session, creator_token: str, participation_id: int) -> bool:
    r = session.put(
        f"{BASE_URL}/api/participations/{participation_id}",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {creator_token}", "Accept": "application/json"},
        timeout=30,
    )
    return r.status_code == 200


def main():
    print(f"[+] BASE_URL: {BASE_URL}")
    print(f"[+] RUN_ID: {RUN_ID}")
    print(f"[+] Creating users: Bucharest={BUCHAREST_USERS}, Rest={REST_USERS}")
    print(f"[+] Activities/user: {ACT_MIN}..{ACT_MAX}")
    print(f"[+] Ledger: {LEDGER_PATH}")

    ledger = {"run_id": RUN_ID, "tag": TAG, "base_url": BASE_URL, "users": []}
    session = requests.Session()

    def make_email(i: int, city: str) -> tuple[str, str]:
        # tag in email so cleanup can find it
        email = f"user{i}_{city.replace(' ', '').replace('ș','s').replace('ț','t').replace('ă','a').replace('î','i').replace('â','a')}_{rands(6)}{TAG}@example.com"
        # pwd = f"Pass!{rands(10)}"
        pwd = "pass1234"
        return email, pwd

    # Bucharest users
    user_index = 0
    for _ in range(BUCHAREST_USERS):
        city = "Bucharest"
        base_lat, base_lon = CITIES[city]
        lat, lon = jitter_latlon(base_lat, base_lon, km=4.0)

        email, pwd = make_email(user_index, city)
        tok = create_user_and_login(session, email, pwd, city)

        if tok:
            me = get_me(session, tok)
            user_id = me["id"] if me and "id" in me else None

            # activities
            k = random.randint(ACT_MIN, ACT_MAX)
            created = 0
            for _a in range(k):
                if create_activity(session, tok, lat, lon):
                    created += 1

            ledger["users"].append({"email": email, "password": pwd, "token": tok, "user_id": user_id, "city": city, "lat": lat, "lon": lon, "activities_created": created})

        user_index += 1
        if SLEEP:
            time.sleep(SLEEP)

    # rest of Romania users
    for _ in range(REST_USERS):
        city = random.choice(REST_CITY_NAMES)
        base_lat, base_lon = CITIES[city]
        lat, lon = jitter_latlon(base_lat, base_lon, km=6.0)

        email, pwd = make_email(user_index, city)
        tok = create_user_and_login(session, email, pwd, city)

        if tok:
            me = get_me(session, tok)
            user_id = me["id"] if me and "id" in me else None

            k = random.randint(ACT_MIN, ACT_MAX)
            created = 0
            for _a in range(k):
                if create_activity(session, tok, lat, lon):
                    created += 1

            ledger["users"].append({"email": email, "password": pwd, "token": tok, "user_id": user_id, "city": city, "lat": lat, "lon": lon, "activities_created": created})
        user_index += 1
        if SLEEP:
            time.sleep(SLEEP)

    print(f"[Success] Done. Created users logged in: {len(ledger['users'])}")
    print(f"[Success] Ledger saved to: {LEDGER_PATH}")
    print(f"[Info] All fake users contain tag: {TAG} (use it for cleanup)")

    # join phase: each user joins 0..3 activities within 0..34km
    # map seeded users so we can "act as creator" to accept requests
    token_by_user_id = {u["user_id"]: u["token"] for u in ledger["users"] if u.get("user_id")}

    print(f"[+] Join phase: each user joins {JOIN_MIN}..{JOIN_MAX} activities within {JOIN_RADIUS_MIN_KM}..{JOIN_RADIUS_MAX_KM} km")

    # precompute all activity ids created by each user (optional improvement)
    for u in ledger["users"]:
        tok = u["token"]
        lat = u["lat"]
        lon = u["lon"]

        radius_km = random.uniform(JOIN_RADIUS_MIN_KM, JOIN_RADIUS_MAX_KM)
        nearby = get_nearby_activities(session, tok, lat, lon, radius_km)

        # candidates: avoid full activities, avoid duplicates
        candidates = []
        for a in nearby:
            if "id" not in a:
                continue

            # skip full activities if fields exist
            if a.get("max_people") is not None and a.get("participants_count") is not None:
                if a["participants_count"] >= a["max_people"]:
                    continue

            candidates.append(a["id"])

        # choose 0..3
        random.shuffle(candidates)
        n_join = random.randint(JOIN_MIN, JOIN_MAX)

        joined_ids = []
        seen = set()

        for act_id in candidates:
            if len(joined_ids) >= n_join:
                break
            if act_id in seen:
                continue
            seen.add(act_id)

            p = join_activity(session, tok, act_id)
            if not p:
                continue

            participation_id = p.get("id")
            # figure out who the creator is
            a = get_activity(session, tok, act_id)

            if a and a.get("creator_id") == u.get("user_id"):
                continue

            creator_id = a.get("creator_id") if a else None
            creator_tok = token_by_user_id.get(creator_id)

            # accept if we have the creator token (i.e., creator was seeded)
            accepted = False
            if creator_tok and participation_id:
                accepted = accept_participation(session, creator_tok, participation_id)

            joined_ids.append({
                "activity_id": act_id,
                "participation_id": participation_id,
                "accepted": accepted
            })

            if SLEEP:
                time.sleep(SLEEP)

        u["joined_activity_ids"] = joined_ids
        u["join_radius_km_used"] = radius_km

    with open(LEDGER_PATH, "w", encoding="utf-8") as f:
        json.dump(ledger, f, indent=2)

if __name__ == "__main__":
    main()
