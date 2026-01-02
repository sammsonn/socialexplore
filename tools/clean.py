import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

BASE_URL = os.getenv("SEED_BASE_URL", "http://localhost:8000").rstrip("/")
SLEEP = float(os.getenv("SEED_SLEEP", "0.01"))


def get_openapi() -> Dict[str, Any]:
    r = requests.get(f"{BASE_URL}/openapi.json", timeout=30)
    r.raise_for_status()
    return r.json()


def find_paths(openapi: Dict[str, Any], contains: List[str], method: str) -> List[str]:
    """Return all paths containing all substrings in `contains` that support `method`."""
    method = method.lower()
    out = []
    for p, methods in openapi.get("paths", {}).items():
        if all(s in p.lower() for s in contains):
            if method in {m.lower() for m in methods.keys()}:
                out.append(p)
    return out


def request_json(method: str, path: str, token: Optional[str] = None, body: Optional[dict] = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"

    url = f"{BASE_URL}{path}"
    return requests.request(method, url, headers=headers, json=body, timeout=30)


def try_delete_user(token: str, openapi: Dict[str, Any]) -> bool:
    # common self-delete endpoints
    candidates = []
    for p in find_paths(openapi, ["users", "me"], "delete"):
        candidates.append(p)
    for p in find_paths(openapi, ["user", "me"], "delete"):
        if p not in candidates:
            candidates.append(p)

    # also sometimes /users/{id} exists but we do NOT want to guess ids here
    for path in candidates:
        r = request_json("DELETE", path, token=token)
        if r.status_code in (200, 204):
            return True
    return False


def extract_id(obj: Any) -> Optional[str]:
    # common id fields
    if isinstance(obj, dict):
        for k in ("id", "activity_id", "uuid"):
            if k in obj:
                return str(obj[k])
    return None


def list_activities_created_by_me(token: str, openapi: Dict[str, Any]) -> List[str]:
    """
    Best-effort: find an endpoint that lists activities for the current user,
    then extract ids from the response.
    """
    # Common patterns:
    # GET /activities/me
    # GET /activities/mine
    # GET /activities/created
    # GET /activities/
    candidates = []
    candidates += find_paths(openapi, ["activities", "me"], "get")
    candidates += find_paths(openapi, ["activities", "mine"], "get")
    candidates += find_paths(openapi, ["activities", "created"], "get")
    # if there's only GET /activities, we might still use it (but it's risky / may return everything)
    # we'll only use it if it looks like a "my activities" endpoint.
    # so we do NOT add plain /activities automatically.

    ids: List[str] = []
    for path in candidates:
        r = request_json("GET", path, token=token)
        if r.status_code != 200:
            continue
        try:
            data = r.json()
        except Exception:
            continue

        # response might be list or object with "items"
        items = data
        if isinstance(data, dict):
            for key in ("items", "data", "results"):
                if key in data and isinstance(data[key], list):
                    items = data[key]
                    break

        if isinstance(items, list):
            for it in items:
                _id = extract_id(it)
                if _id:
                    ids.append(_id)

        if ids:
            break  # stop after first working endpoint

    # de-dup
    return sorted(set(ids))


def delete_activity_by_id(token: str, openapi: Dict[str, Any], activity_id: str) -> bool:
    # DELETE /activities/{something}
    delete_paths = find_paths(openapi, ["activities", "{"], "delete") + find_paths(openapi, ["activity", "{"], "delete")
    # the first path that looks like /activities/{id}
    for p in delete_paths:
        if "{id}" in p or "{activity_id}" in p:
            path = p.replace("{id}", activity_id).replace("{activity_id}", activity_id)
            r = request_json("DELETE", path, token=token)
            if r.status_code in (200, 204):
                return True
    return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/cleanup_ro.py seed_ledger_SEED_YYYYMMDDTHHMMSS.json")
        sys.exit(1)

    ledger_path = sys.argv[1]
    with open(ledger_path, "r", encoding="utf-8") as f:
        ledger = json.load(f)

    users = ledger.get("users", [])
    run_id = ledger.get("run_id", "UNKNOWN")
    tag = ledger.get("tag", "")

    print(f"[+] Cleanup run_id={run_id} tag={tag}")
    print(f"[+] Users in ledger: {len(users)}")
    print(f"[+] BASE_URL: {BASE_URL}")

    openapi = get_openapi()

    deleted_activities = 0
    deleted_users = 0
    user_delete_supported = len(find_paths(openapi, ["users", "me"], "delete")) > 0 or len(find_paths(openapi, ["user", "me"], "delete")) > 0

    print(f"[i] User self-delete supported: {user_delete_supported}")

    for idx, u in enumerate(users, start=1):
        email = u.get("email", "?")
        token = u.get("token")
        if not token:
            print(f"[!] Missing token for {email}, skipping")
            continue

        # 1) delete activities (best-effort)
        act_ids = list_activities_created_by_me(token, openapi)
        if act_ids:
            for aid in act_ids:
                ok = delete_activity_by_id(token, openapi, aid)
                if ok:
                    deleted_activities += 1
            print(f"[{idx}/{len(users)}] {email}: deleted_activities={len(act_ids)} (best-effort)")
        else:
            print(f"[{idx}/{len(users)}] {email}: no activity list endpoint worked (skipping activities)")

        time.sleep(SLEEP)

        # 2) delete the user itself (if endpoint exists)
        if user_delete_supported:
            ok = try_delete_user(token, openapi)
            if ok:
                deleted_users += 1
                print(f"[{idx}/{len(users)}] {email}: user deleted")
            else:
                print(f"[{idx}/{len(users)}] {email}: user delete failed (endpoint exists but rejected)")

        time.sleep(SLEEP)

    print("\n[✓] Cleanup complete")
    print(f"    Activities deleted (best-effort): {deleted_activities}")
    print(f"    Users deleted: {deleted_users}")
    print("\nIf users weren't deleted, your API likely doesn't expose DELETE /users/me.")
    print("In that case, the cleanest next step is adding a dev-only delete endpoint or doing DB cleanup.")

if __name__ == "__main__":
    main()
