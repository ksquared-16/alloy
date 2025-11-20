import os
import re
import logging
import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
logger = logging.getLogger("uvicorn")

# ---------------------------
# ENV VARIABLES / CONSTANTS
# ---------------------------
GHL_API_KEY = os.getenv("GHL_API_KEY")
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "ZO1DxVJw65kU2EbHpHLq")  # fallback to your cleaning subaccount
GHL_BASE_URL = "https://services.leadconnectorhq.com"
MCP_URL = "https://services.leadconnectorhq.com/mcp"


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
# Normalize tags from GHL
# ---------------------------
def normalize_tags(raw_tags):
    """
    GHL can return tags as:
    - list of strings
    - comma-separated string
    - list of dicts: [{"name": "available_today"}, ...]
    """
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
# FETCH CONTRACTORS FROM GHL
# ---------------------------
def fetch_contractors_from_ghl():
    if not GHL_API_KEY:
        logger.error("GHL_API_KEY missing — contractors cannot be fetched")
        return []

    url = f"{GHL_BASE_URL}/contacts/"

    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Accept": "application/json",
        "Version": "2021-07-28",
    }

    params = {
        "limit": 100,
        "locationId": GHL_LOCATION_ID,
    }

    try:
        resp = requests.get(url, headers=headers, params=params)
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
        name = (c.get("contactName") or "").strip()

        if not name:
            name = f"{(c.get('firstName') or '').strip()} {(c.get('lastName') or '').strip()}".strip()

        # Skip if no phone
        if not phone:
            continue

        # Contractor detection rules
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
# SEND SMS VIA MCP (LeadConnector MCP server)
# ---------------------------
def send_sms_to_contractor(contact_id: str, message: str):
    if not GHL_API_KEY:
        logger.error("GHL_API_KEY missing — cannot send SMS")
        return

    payload = {
        "jsonrpc": "2.0",
        "method": "Conversations.sendMessage",
        "params": {
            "locationId": GHL_LOCATION_ID,
            "contactId": contact_id,
            "type": "SMS",
            "message": message,
        },
        "id": "1",
    }

    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Version": "2021-07-28",
    }

    try:
        logger.info(f"Sending SMS via MCP: {payload}")
        resp = requests.post(MCP_URL, headers=headers, json=payload)

        if resp.status_code != 200:
            logger.error(f"MCP SMS failed ({resp.status_code}): {resp.text}")
        else:
            logger.info(f"MCP SMS success: {resp.text}")
    except Exception as e:
        logger.error(f"MCP SMS exception: {e}")


# ---------------------------
# DISPATCH ENDPOINT
# ---------------------------
@app.post("/dispatch")
async def dispatch(request: Request):
    payload = await request.json()
    logger.info(f"Received payload from GHL: {payload}")

    # Minimal job summary for SMS
    calendar = payload.get("calendar", {})
    job_id = calendar.get("appointmentId") or calendar.get("id")
    start_time = calendar.get("startTime")
    end_time = calendar.get("endTime")

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
        "start_time": start_time,
        "end_time": end_time,
    }

    logger.info(f"Job summary: {job_summary}")

    # Fetch contractors
    contractors = fetch_contractors_from_ghl()
    logger.info(f"Contractors found: {contractors}")

    # Build SMS message
    # Keep it simple for now; we can refine content later
    est_price_str = f"${estimated_price:0.2f}" if estimated_price else "$0.00"
    when_str = "TBD"
    if start_time and end_time:
        when_str = f"{start_time} → {end_time}"

    sms_message = (
        "New cleaning job available:\n"
        f"Customer: {customer_name}\n"
        f"Service: {service_type}\n"
        f"When: {when_str}\n"
        f"Est. price: {est_price_str}\n\n"
        "Reply YES to accept."
    )

    notified_ids = []

    for c in contractors:
        cid = c["id"]
        logger.info(f"About to send SMS to contractor {cid} ({c['phone']})")
        send_sms_to_contractor(cid, sms_message)
        notified_ids.append(cid)

    return JSONResponse(
        {
            "ok": True,
            "job": job_summary,
            "contractors_notified": notified_ids,
        }
    )