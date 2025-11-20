import os
import re
import logging
import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
logger = logging.getLogger("uvicorn")

# ---------------------------
# ENV VARIABLES
# ---------------------------
GHL_API_KEY = os.getenv("GHL_API_KEY")
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "ZO1DxVJw65kU2EbHpHLq")

# All working calls should use the same base:
# This is what your successful curl used.
GHL_BASE_URL = "https://services.leadconnectorhq.com"

# Contacts:  https://services.leadconnectorhq.com/contacts
GHL_CONTACTS_URL = f"{GHL_BASE_URL}/contacts"

# SMS / Conversations API:
# Docs + examples show this endpoint:
#   POST https://services.leadconnectorhq.com/conversations/messages
LC_SMS_URL = f"{GHL_BASE_URL}/conversations/messages"


@app.get("/")
async def root():
    return {"status": "ok", "message": "Alloy dispatcher root"}


@app.get("/health")
async def health():
    return {"status": "ok", "message": "Alloy dispatcher is live"}


# ---------------------------
# Helper: strip numbers from messy strings
# ---------------------------
def to_number(value):
    if value is None:
        return None
    cleaned = re.sub(r"[^\d.]", "", str(value))
    if cleaned == "":
        return None
    try:
        return float(cleaned)
    except Exception:
        return None


# ---------------------------
# Extract price from payload
# ---------------------------
def extract_estimated_price(payload: dict) -> float:
    direct = payload.get("Estimated Price (Contact)") or payload.get("Estimated Price")
    num = to_number(direct)
    if num is not None:
        return num

    breakdown = payload.get("Price Breakdown (Contact)") or payload.get("Price Breakdown") or ""
    match = re.search(r"Total:\s*\$?([0-9]+(?:\.[0-9]+)?)", breakdown)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return 0.0

    return 0.0


# ---------------------------
# Normalize tags (string/list/list-of-dicts)
# ---------------------------
def normalize_tags(raw_tags):
    if raw_tags is None:
        return []

    if isinstance(raw_tags, list):
        cleaned = []
        for t in raw_tags:
            if isinstance(t, str):
                cleaned.append(t.lower())
            elif isinstance(t, dict) and "name" in t:
                cleaned.append(t["name"].lower())
        return cleaned

    if isinstance(raw_tags, str):
        return [t.strip().lower() for t in raw_tags.split(",") if t.strip()]

    return []


# ---------------------------
# Fetch contractors from GHL
# ---------------------------
def fetch_contractors_from_ghl():
    if not GHL_API_KEY:
        logger.error("GHL_API_KEY missing — contractors cannot be fetched")
        return []

    params = {
        "limit": 100,  # 100 max per the API
        "locationId": GHL_LOCATION_ID,
    }

    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-07-28",
        "Accept": "application/json",
    }

    try:
        resp = requests.get(GHL_CONTACTS_URL, headers=headers, params=params, timeout=10)
    except Exception as e:
        logger.error(f"GHL contact fetch exception: {e}")
        return []

    if resp.status_code != 200:
        logger.error(f"GHL contact fetch failed ({resp.status_code}): {resp.text}")
        return []

    data = resp.json()
    contacts = data.get("contacts", [])

    contractors = []

    for c in contacts:
        source = (c.get("source") or "").lower()
        tags = normalize_tags(c.get("tags"))
        phone = c.get("phone")
        name = f"{c.get('firstName', '')} {c.get('lastName', '')}".strip() or c.get("contactName", "")

        if not phone:
            continue

        is_source = source == "contractor-cleaning"
        has_tag = any("contractor" in t for t in tags)

        if is_source or has_tag:
            contractors.append(
                {
                    "id": c.get("id"),
                    "name": name,
                    "phone": phone,
                    "tags": tags,
                    "contact_source": source,
                }
            )

    logger.info(f"Fetched {len(contractors)} contractors from GHL")
    return contractors


@app.get("/contractors")
async def contractors_probe():
    contractors = fetch_contractors_from_ghl()
    return {
        "ok": True,
        "count": len(contractors),
        "contractors": contractors,
    }


# ---------------------------
# Send SMS via Conversations API
# ---------------------------
def send_sms_to_contractor(contact_id: str, message: str):
    if not GHL_API_KEY:
        logger.error("GHL_API_KEY missing — cannot send SMS")
        return False

    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
    }

    payload = {
        "locationId": GHL_LOCATION_ID,
        "contactId": contact_id,
        "type": "SMS",
        "message": message,
    }

    logger.info(f"Sending SMS via LC: {payload}")

    try:
        resp = requests.post(LC_SMS_URL, headers=headers, json=payload, timeout=10)
    except Exception as e:
        logger.error(f"SMS send exception: {e}")
        return False

    if resp.status_code >= 200 and resp.status_code < 300:
        logger.info(f"SMS send success ({resp.status_code}): {resp.text}")
        return True

    logger.error(f"SMS send failed ({resp.status_code}): {resp.text}")
    return False


# ---------------------------
# Dispatch endpoint
# ---------------------------
@app.post("/dispatch")
async def dispatch(request: Request):
    payload = await request.json()
    logger.info(f"Received payload from GHL: {payload}")

    # Extract a minimal job summary (works for test payloads too)
    calendar = payload.get("calendar", {}) or {}
    job_id = calendar.get("appointmentId") or calendar.get("id")

    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    full_name = payload.get("full_name") or f"{first_name} {last_name}".strip()
    customer_name = full_name or "Unknown"

    service_type = (
        payload.get("Service Type")
        or payload.get("Service Needed")
        or "Standard Home Cleaning"
    )

    estimated_price = extract_estimated_price(payload)

    job_summary = {
        "job_id": job_id,
        "customer_name": customer_name,
        "service_type": service_type,
        "estimated_price": estimated_price,
    }

    logger.info(f"Job summary: {job_summary}")

    # Fetch contractors
    contractors = fetch_contractors_from_ghl()
    logger.info(f"Contractors found: {contractors}")

    # Build the SMS text
    sms_text = (
        "New cleaning job available:\n"
        f"Customer: {job_summary['customer_name']}\n"
        f"Service: {job_summary['service_type']}\n"
        f"When: TBD\n"
        f"Address: TBD\n"
        f"Est. price: ${job_summary['estimated_price']:.2f}\n\n"
        "Reply YES to accept."
    )

    notified_ids = []
    for c in contractors:
        ok = send_sms_to_contractor(c["id"], sms_text)
        if ok:
            notified_ids.append(c["id"])

    return JSONResponse(
        {
            "ok": True,
            "job": job_summary,
            "contractors_notified": notified_ids,
        }
    )