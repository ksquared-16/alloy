"""
Dispatch and contractor reply routes.
"""
import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..settings import JOB_STORE
from ..ghl_client import (
    build_job_summary,
    fetch_contractors,
    send_conversation_sms,
    upsert_job_assignment_to_ghl,
)

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


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

    # Build contractor SMS message (NO access info yet – only broadcast)
    postal_code = job_summary.get("postal_code", "")
    zip_line = f"ZIP: {postal_code}\n" if postal_code else ""
    price_line = f"Est. price: ${job_summary['estimated_price']:.2f}\n" if job_summary.get("estimated_price", 0) > 0 else ""
    
    msg = (
        f"New cleaning job available\n\n"
        f"Customer: {job_summary['customer_name']}\n"
        f"Service: {job_summary['service_type']}\n"
        f"When: {job_summary.get('start_time', 'TBD')}\n"
        f"{zip_line}"
        f"{price_line}"
        f"\nReply YES {job_summary['job_id']} to accept."
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

    # Start with job_id from customData if present and non-empty
    job_id = custom.get("job_id")
    if isinstance(job_id, str):
        job_id = job_id.strip() or None

    # If not provided, try to parse "YES <job_id>" pattern
    if not job_id and len(parts) >= 2 and parts[0].upper() == "YES":
        job_id = parts[1].strip() or None

    job = None

    # If we have an explicit job_id, try to get it from JOB_STORE
    if job_id:
        job = JOB_STORE.get(job_id)

    # If no job yet, but it's a YES/Y reply, fall back to latest job
    if not job:
        if text_upper not in ("YES", "Y", "YEA", "YEAH", "YEP"):
            logger.error(
                "contractor-reply: invalid reply format: %s", message_text
            )
            return JSONResponse(
                {
                    "ok": False,
                    "reason": "invalid_format",
                    "message_text": message_text,
                },
                status_code=200,
            )

        # Look for jobs we notified this contractor about
        candidate_jobs = [
            (jid, j)
            for jid, j in JOB_STORE.items()
            if contact_id and contact_id in (j.get("notified_contractors") or [])
        ]
        if not candidate_jobs:
            logger.error(
                "contractor-reply: no matching job found for contractor %s. Known job_ids=%s",
                contact_id,
                list(JOB_STORE.keys()),
            )
            return JSONResponse(
                {
                    "ok": False,
                    "reason": "job_not_found_for_contractor",
                    "contact_id": contact_id,
                },
                status_code=200,
            )

        # Pick the most recently dispatched job
        candidate_jobs.sort(key=lambda pair: pair[1].get("dispatched_at", ""))
        job_id, job = candidate_jobs[-1]

    if not job or not job_id:
        logger.error(
            "contractor-reply: job still not resolved. job_id=%s, known job_ids=%s",
            job_id,
            list(JOB_STORE.keys()),
        )
        return JSONResponse(
            {"ok": False, "reason": "job_not_found", "job_id": job_id},
            status_code=200,
        )

    # Lookup contractor info (mainly for name in logs / notifications)
    contractors = fetch_contractors()
    contractor = next((c for c in contractors if c.get("id") == contact_id), None)

    contractor_name = contractor.get("name") if contractor else "Unknown contractor"

    # Mark assignment in memory
    job["assigned_contractor_id"] = contact_id
    job["assigned_contractor_name"] = contractor_name

    # 1) Confirm to the accepting contractor — including all details
    # Format date/time nicely
    start_time_display = job.get("start_time", "TBD")
    if job.get("start_time_iso"):
        try:
            dt = datetime.fromisoformat(job["start_time_iso"].replace("Z", "+00:00"))
            start_time_display = dt.strftime("%A, %B %d at %I:%M %p")
        except Exception:
            pass  # Fall back to raw start_time
    
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

