"""
Dispatch and contractor reply routes.
"""
import logging
import random
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import pytz

from ..settings import JOB_STORE, OFFER_STORE, GHL_STAGE_ID_ASSIGNED
from ..ghl_client import (
    build_job_summary,
    fetch_contractors,
    send_conversation_sms,
    upsert_job_assignment_to_ghl,
    update_opportunity_stage,
)

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()

# Timezone for date formatting
LA_TZ = pytz.timezone("America/Los_Angeles")


def format_datetime_friendly(iso_string: Optional[str], fallback: str = "TBD") -> str:
    """
    Convert ISO datetime string to friendly format in America/Los_Angeles timezone.
    
    Args:
        iso_string: ISO datetime string (may include Z or timezone offset)
        fallback: String to return if parsing fails
    
    Returns:
        Formatted string like "Wed, Jan 8 at 8:00 AM"
    """
    if not iso_string:
        return fallback
    
    try:
        # Handle both Z and timezone-aware strings
        if iso_string.endswith("Z"):
            dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(iso_string)
        
        # Convert to UTC if naive
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        
        # Convert to LA timezone
        dt_la = dt.astimezone(LA_TZ)
        
        # Format: "Wed, Jan 8 at 8:00 AM"
        # Use day without leading zero and hour without leading zero
        day = dt_la.day
        hour_str = dt_la.strftime("%I").lstrip("0") or "12"  # Handle 12-hour format, remove leading zero
        minute_str = dt_la.strftime("%M")
        am_pm = dt_la.strftime("%p")
        weekday = dt_la.strftime("%a")
        month = dt_la.strftime("%b")
        return f"{weekday}, {month} {day} at {hour_str}:{minute_str} {am_pm}"
    except Exception as e:
        logger.warning("format_datetime_friendly: failed to parse %s: %s", iso_string, e)
        return fallback


def generate_offer_code() -> str:
    """
    Generate a unique 5-digit code (10000-99999) that doesn't exist in OFFER_STORE.
    
    Returns:
        5-digit code string
    """
    max_attempts = 100
    for _ in range(max_attempts):
        code = str(random.randint(10000, 99999))
        if code not in OFFER_STORE:
            return code
    # Fallback: use timestamp-based code if all random codes are taken
    return str(random.randint(10000, 99999)) + str(int(datetime.utcnow().timestamp()))[-3:]


@router.post("/dispatch")
async def dispatch(request: Request):
    """
    Webhook endpoint called by GHL when a customer books a cleaning appointment.

    Args (request body):
        GHL webhook payload containing appointment/calendar data and contact information.

    Returns:
        JSON with ok=True, job summary, and list of notified contractor IDs.

    Side effects:
        1. Builds a job summary from the appointment payload
        2. Caches the job in JOB_STORE (keyed by job_id / appointmentId)
        3. Fetches eligible contractors (tagged with contractor_cleaning + job-pending-assignment)
        4. Sends SMS to each contractor with job details and "Reply YES <job_id> to accept"

    Note:
        The SMS sent to contractors does NOT include home access information yet.
        Access info is only shared after a contractor accepts the job.
    """
    payload = await request.json()
    logger.info("Received payload from GHL: %s", payload)

    job_summary = build_job_summary(payload)

    # Extract opportunity_id from payload if available
    opportunity_id = (
        payload.get("opportunity_id") or
        payload.get("opportunityId") or
        payload.get("opportunity", {}).get("id") if isinstance(payload.get("opportunity"), dict) else None
    )
    if opportunity_id:
        job_summary["opportunity_id"] = opportunity_id

    # Enrich with dispatch metadata
    job_summary.setdefault("notified_contractors", [])
    job_summary["assigned_contractor_id"] = None
    job_summary["assigned_contractor_name"] = None
    job_summary["dispatched_at"] = datetime.utcnow().isoformat()

    # Cache the job in memory so /contractor-reply can find it
    job_id = job_summary.get("job_id")
    if job_id:
        JOB_STORE[job_id] = job_summary
        logger.info(
            "Cached job in memory with id=%s. JOB_STORE now has %d jobs.",
            job_id,
            len(JOB_STORE),
        )
    else:
        logger.warning("No job_id in job_summary; not caching this job.")

    contractors = fetch_contractors()
    logger.info("Contractors found: %s", contractors)

    # Filter contractors to only include those with both required tags
    # Normalize required tags: lowercase and trim whitespace
    required_tags = {tag.strip().lower() for tag in ["contractor_forms_completed", "contractor_cleaning"]}
    initial_count = len(contractors)
    eligible_contractors = []
    filtered_candidates = []  # Track filtered contractors for logging
    
    logger.info("contractor_filter_debug: filtering contractors, initial_count=%d required_tags=%s", 
                initial_count, required_tags)
    
    for contractor in contractors:
        # Normalize contractor tags: lowercase and trim whitespace
        raw_tags = contractor.get("tags", [])
        normalized_tags = {str(tag).strip().lower() for tag in raw_tags if tag}
        contractor_tags_set = normalized_tags
        
        if required_tags.issubset(contractor_tags_set):
            eligible_contractors.append(contractor)
        else:
            # Track filtered contractors for detailed logging
            filtered_candidates.append({
                "id": contractor.get("id", "unknown"),
                "raw_tags": raw_tags,
                "normalized_tags": contractor_tags_set
            })
    
    filtered_out_count = initial_count - len(eligible_contractors)
    
    logger.info("contractor_filter_debug: after filtering, eligible_count=%d filtered_out_count=%d", 
                len(eligible_contractors), filtered_out_count)
    
    if filtered_out_count > 0:
        logger.info(
            "contractor_filter_debug: filtered out %d contractor(s) missing required tags (required: %s)",
            filtered_out_count,
            required_tags
        )
        # If filtered to 0, log details of each candidate
        if len(eligible_contractors) == 0 and filtered_candidates:
            logger.warning("contractor_filter_debug: all contractors filtered out. Candidate details:")
            for candidate in filtered_candidates:
                logger.warning("contractor_filter_debug: candidate id=%s raw_tags=%s normalized_tags=%s", 
                             candidate["id"], candidate["raw_tags"], candidate["normalized_tags"])
    
    contractors = eligible_contractors

    if not contractors:
        logger.warning("No contractors available for dispatch.")
        return JSONResponse(
            {
                "ok": False,
                "reason": "no_contractors",
                "job": job_summary,
            }
        )

    # Generate offer code and store in OFFER_STORE
    offer_code = generate_offer_code()
    expires_at = datetime.utcnow() + timedelta(hours=24)
    
    OFFER_STORE[offer_code] = {
        "opportunity_id": job_summary.get("opportunity_id"),
        "job_id": job_id,
        "customer_contact_id": job_summary.get("contact_id"),
        "expires_at": expires_at.isoformat(),
        "sent_to_contractor_ids": [],
    }
    
    logger.info("OFFER_CODE_CREATED code=%s opportunity_id=%s job_id=%s", 
                offer_code, job_summary.get("opportunity_id"), job_id)

    # Format friendly date/time
    friendly_datetime = format_datetime_friendly(
        job_summary.get("start_time_iso") or job_summary.get("start_time"),
        job_summary.get("start_time", "TBD")
    )

    # Build contractor SMS message (NO access info yet – only broadcast)
    postal_code = job_summary.get("postal_code", "")
    zip_line = f"ZIP: {postal_code}\n" if postal_code else ""
    price_line = f"Est. price: ${job_summary['estimated_price']:.2f}\n" if job_summary.get("estimated_price", 0) > 0 else ""
    
    msg = (
        f"New cleaning job available\n"
        f"Customer: {job_summary['customer_name']}\n"
        f"Service: {job_summary['service_type']}\n"
        f"When: {friendly_datetime}\n"
        f"{zip_line}"
        f"{price_line}"
        f"\nReply YES {offer_code} to accept."
    )

    notified_ids: List[str] = []
    for c in contractors:
        cid = c.get("id")
        phone = c.get("phone")
        if not cid or not phone:
            logger.info(
                "Skipping contractor without valid id/phone: id=%s phone=%s",
                cid,
                phone,
            )
            continue
        send_conversation_sms(cid, msg)
        notified_ids.append(cid)
        job_summary["notified_contractors"].append(cid)
        # Track which contractors received this offer
        OFFER_STORE[offer_code]["sent_to_contractor_ids"].append(cid)

    return JSONResponse(
        {
            "ok": True,
            "job": job_summary,
            "contractors_notified": notified_ids,
        }
    )


@router.post("/contractor-reply")
async def contractor_reply(request: Request):
    """
    Webhook endpoint called by GHL when a contractor replies to a dispatch SMS.

    Args (request body):
        GHL webhook payload containing:
        - contact_id: GHL contact ID of the contractor
        - message: The SMS reply text
        - customData: Optional metadata (may include job_id)

    Returns:
        JSON with ok=True, job_id, contractor_id, and contractor_name if successful.

    Supported reply formats:
        - "YES <job_id>" (explicit job ID)
        - "Yes" / "Y" / "Yeah" / "Yep" (infers latest job sent to that contractor)

    Side effects:
        1. Assigns the job to the accepting contractor
        2. Sends confirmation SMS to the contractor (NOW includes home access info)
        3. Notifies all other contractors that the job was claimed
        4. Notifies the customer their job has been assigned
        5. Updates the GHL Jobs custom object with assignment details
    """
    payload = await request.json()
    logger.info("Received contractor reply webhook: %s", payload)

    custom = payload.get("customData") or {}

    contact_id = (
        payload.get("contact_id")
        or payload.get("contactId")
        or custom.get("contact_id")
    )

    # Prefer customData.body, then message.body, then raw message string
    message_obj = payload.get("message") or {}
    raw_message = custom.get("body") or message_obj.get("body") or payload.get(
        "message"
    )

    # Normalize raw_message -> string
    if isinstance(raw_message, dict):
        raw_message = raw_message.get("body") or ""
    if raw_message is None:
        raw_message = ""

    message_text = str(raw_message)
    logger.info(
        "Parsed contractor reply: contact_id=%s, message_text=%s",
        contact_id,
        message_text,
    )

    text_stripped = message_text.strip()
    text_upper = text_stripped.upper()
    parts = text_stripped.split()

    # Parse 5-digit code from message
    # Supported formats: "YES 12345", "12345", "Yes 12345"
    offer_code = None
    if len(parts) >= 2 and parts[0].upper() in ("YES", "Y", "YEA", "YEAH", "YEP"):
        # Format: "YES 12345"
        potential_code = parts[1].strip()
        if potential_code.isdigit() and len(potential_code) == 5:
            offer_code = potential_code
    elif len(parts) == 1 and parts[0].isdigit() and len(parts[0]) == 5:
        # Format: "12345"
        offer_code = parts[0].strip()

    logger.info("OFFER_ACCEPT_ATTEMPT contractor_id=%s code=%s message_text=%s", 
                contact_id, offer_code, message_text)

    # Validate offer code
    if not offer_code or offer_code not in OFFER_STORE:
        # Invalid code - send rejection message
        logger.warning("OFFER_ACCEPT_INVALID reason=code_not_found contractor_id=%s code=%s", 
                      contact_id, offer_code)
        rejection_msg = "Invalid code. Please reply with the 5-digit code from the job offer."
        if offer_code:
            rejection_msg = f"Invalid code. Reply YES {offer_code} to accept."
        send_conversation_sms(contact_id, rejection_msg)
        return JSONResponse(
            {
                "ok": False,
                "reason": "invalid_code",
                "message_text": message_text,
                "code": offer_code,
            },
            status_code=200,
        )

    offer = OFFER_STORE[offer_code]
    
    # Check expiration
    expires_at_str = offer.get("expires_at")
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if datetime.utcnow().replace(tzinfo=pytz.UTC) > expires_at:
                logger.warning("OFFER_ACCEPT_INVALID reason=expired contractor_id=%s code=%s", 
                              contact_id, offer_code)
                send_conversation_sms(contact_id, "This offer has expired. Please wait for a new job offer.")
                # Clean up expired offer
                del OFFER_STORE[offer_code]
                return JSONResponse(
                    {
                        "ok": False,
                        "reason": "code_expired",
                        "code": offer_code,
                    },
                    status_code=200,
                )
        except Exception as e:
            logger.warning("contractor-reply: failed to parse expires_at %s: %s", expires_at_str, e)

    # Get job_id and opportunity_id from offer
    job_id = offer.get("job_id")
    opportunity_id = offer.get("opportunity_id")
    
    # Get job from JOB_STORE
    job = JOB_STORE.get(job_id) if job_id else None

    if not job:
        logger.error(
            "contractor-reply: job not found in JOB_STORE. job_id=%s, known job_ids=%s",
            job_id,
            list(JOB_STORE.keys()),
        )
        send_conversation_sms(contact_id, "Job not found. Please contact support.")
        return JSONResponse(
            {"ok": False, "reason": "job_not_found", "job_id": job_id},
            status_code=200,
        )

    # Lookup contractor info and validate eligibility
    contractors = fetch_contractors()
    contractor = next((c for c in contractors if c.get("id") == contact_id), None)

    if not contractor:
        logger.warning("OFFER_ACCEPT_INVALID reason=contractor_not_found contractor_id=%s code=%s", 
                      contact_id, offer_code)
        send_conversation_sms(contact_id, "Contractor not found. Please contact support.")
        return JSONResponse(
            {"ok": False, "reason": "contractor_not_found", "contact_id": contact_id},
            status_code=200,
        )

    # Validate contractor has required tags
    required_tags = {tag.strip().lower() for tag in ["contractor_forms_completed", "contractor_cleaning"]}
    raw_tags = contractor.get("tags", [])
    normalized_tags = {str(tag).strip().lower() for tag in raw_tags if tag}
    
    if not required_tags.issubset(normalized_tags):
        logger.warning("OFFER_ACCEPT_INVALID reason=contractor_not_eligible contractor_id=%s code=%s tags=%s", 
                      contact_id, offer_code, raw_tags)
        send_conversation_sms(contact_id, "You are not eligible for this job. Please contact support.")
        return JSONResponse(
            {"ok": False, "reason": "contractor_not_eligible", "contact_id": contact_id},
            status_code=200,
        )

    contractor_name = contractor.get("name") if contractor else "Unknown contractor"

    # Update opportunity stage if opportunity_id is present
    stage_updated = False
    if opportunity_id and GHL_STAGE_ID_ASSIGNED:
        logger.info("OFFER_ACCEPT_SUCCESS opportunity_id=%s contractor_id=%s code=%s", 
                   opportunity_id, contact_id, offer_code)
        stage_updated = update_opportunity_stage(opportunity_id, GHL_STAGE_ID_ASSIGNED)
        logger.info("OFFER_ACCEPT_SUCCESS stage_updated=%s opportunity_id=%s stage_id=%s", 
                   stage_updated, opportunity_id, GHL_STAGE_ID_ASSIGNED)
    elif opportunity_id:
        logger.warning("contractor-reply: opportunity_id=%s present but GHL_STAGE_ID_ASSIGNED not configured, skipping opportunity stage update", 
                      opportunity_id)
    else:
        logger.info("contractor-reply: no opportunity_id in offer, skipping opportunity stage update (job assignment will continue)")

    # Mark assignment in memory
    job["assigned_contractor_id"] = contact_id
    job["assigned_contractor_name"] = contractor_name
    
    # Invalidate the offer code (remove from OFFER_STORE)
    del OFFER_STORE[offer_code]
    logger.info("contractor-reply: invalidated offer code=%s", offer_code)

    # 1) Confirm to the accepting contractor — including all details
    # Format date/time nicely using the same helper
    start_time_display = format_datetime_friendly(
        job.get("start_time_iso") or job.get("start_time"),
        job.get("start_time", "TBD")
    )
    
    customer_name = job.get("customer_name", "Unknown")
    full_address = job.get("full_address", "")
    access_method = job.get("access_method", "Not specified")
    access_notes = job.get("access_notes", "")
    price_breakdown = job.get("price_breakdown", "")
    
    confirm_msg = f"✅ You got the job\n\n"
    confirm_msg += f"Date/Time: {start_time_display}\n"
    confirm_msg += f"Customer: {customer_name}\n"
    
    if full_address:
        confirm_msg += f"Address: {full_address}\n"
    
    confirm_msg += f"Entry: {access_method}\n"
    
    if access_notes:
        confirm_msg += f"Access notes: {access_notes}\n"
    
    if price_breakdown:
        confirm_msg += f"\nPrice breakdown:\n{price_breakdown}\n"
    
    confirm_msg += "\nReply here if you have questions."

    if contact_id:
        send_conversation_sms(contact_id, confirm_msg)

    # 2) Notify all other contractors that the job was claimed
    for c in contractors:
        cid = c.get("id")
        phone = c.get("phone")
        if not cid or not phone or cid == contact_id:
            if not cid or not phone:
                logger.info(
                    "Skipping contractor without valid id/phone: id=%s phone=%s",
                    cid,
                    phone,
                )
            continue
        send_conversation_sms(
            cid,
            f"Job for {job['customer_name']} on {job['start_time']} has been claimed by another contractor.",
        )

    # 3) Notify the customer their job has been assigned (if we have their contact_id)
    customer_contact_id = job.get("contact_id")
    if customer_contact_id:
        customer_msg = (
            f"Your cleaning on {job['start_time']} has been assigned to one of our partner teams. "
            f"They will contact you before arrival."
        )
        send_conversation_sms(customer_contact_id, customer_msg)

    # 4) Push assignment into Jobs object (custom_objects.jobs)
    upsert_job_assignment_to_ghl(job_id, contact_id or "", contractor_name or "")

    logger.info(
        "contractor-reply: job %s assigned to contractor %s (%s)",
        job_id,
        contact_id,
        contractor_name,
    )

    return JSONResponse(
        {
            "ok": True,
            "job_id": job_id,
            "contractor_id": contact_id,
            "contractor_name": contractor_name,
        }
    )

