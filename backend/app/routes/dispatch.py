"""
Dispatch and contractor reply routes.
"""
import logging
import math
import os
import random
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..settings import (
    JOB_STORE, GHL_STAGE_ID_ASSIGNED, OFFER_STORE, JOBS_OPPORTUNITY_ID_FIELD_KEY, 
    JOBS_OFFER_EXPIRES_AT_FIELD_KEY, OPP_ASSIGNED_CONTRACTOR_FIELD_ID, 
    OPP_CONTRACTOR_PAY_AMOUNT, OPP_RECURRING_CONTRACTOR_PAY_AMOUNT,
    JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY, JOBS_RECURRING_CONTRACTOR_PAY_AMOUNT_FIELD_KEY, CUSTOM_FIELD_IDS
)
from ..ghl_client import (
    build_job_summary,
    fetch_contractors,
    send_conversation_sms,
    upsert_job_assignment_to_ghl,
    update_opportunity_stage,
    update_opportunity_custom_field,
    update_job_offer_code,
    update_job_offer_code_by_record_id,
    find_job_by_offer_code,
    find_job_record_id,
    find_job_record_id_by_offer_code,
    get_job_record,
    get_contact_by_id,
    extract_bedrooms_bathrooms_from_contact,
    enhance_price_breakdown_with_beds_baths_and_contractor_pay,
    update_job_custom_field_by_record_id,
)

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


def resolve_schedule_timezone_iana_str(job_summary: Dict[str, Any]) -> str:
    """IANA zone for job metadata / SMS display; payload → env → UTC (matches org operational fallback)."""
    for key in ("timezone", "time_zone", "timeZone", "iana_timezone"):
        raw = job_summary.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    sched = job_summary.get("schedule")
    if isinstance(sched, dict):
        for key in ("timezone", "time_zone"):
            raw = sched.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
    env_tz = os.environ.get("ALLOY_DEFAULT_BUSINESS_TIMEZONE", "").strip()
    if env_tz:
        return env_tz
    return "UTC"


def resolve_friendly_display_tz(job_summary: Dict[str, Any]) -> ZoneInfo:
    tz_str = resolve_schedule_timezone_iana_str(job_summary)
    try:
        return ZoneInfo(tz_str)
    except Exception:
        return ZoneInfo("UTC")


def format_datetime_friendly(
    iso_string: Optional[str],
    fallback: str = "TBD",
    display_tz: Optional[ZoneInfo] = None,
) -> str:
    """
    Convert ISO datetime string to a friendly format in ``display_tz`` (default UTC).

    Naive ISO strings are interpreted as local wall time in ``display_tz``.
    """
    if not iso_string:
        return fallback

    tz = display_tz or ZoneInfo("UTC")

    try:
        # Handle both Z and timezone-aware strings
        if iso_string.endswith("Z"):
            dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(iso_string)

        if dt.tzinfo is None:
            dt_local = dt.replace(tzinfo=tz)
        else:
            dt_local = dt.astimezone(tz)

        day = dt_local.day
        hour_str = dt_local.strftime("%I").lstrip("0") or "12"
        minute_str = dt_local.strftime("%M")
        am_pm = dt_local.strftime("%p")
        weekday = dt_local.strftime("%a")
        month = dt_local.strftime("%b")
        return f"{weekday}, {month} {day} at {hour_str}:{minute_str} {am_pm}"
    except Exception as e:
        logger.warning("format_datetime_friendly: failed to parse %s: %s", iso_string, e)
        return fallback


def get_recurring_price_numeric(payload: Dict[str, Any], customer_contact: Optional[Dict[str, Any]] = None) -> Optional[float]:
    """
    Get recurring_price as a numeric value, prioritizing payload over contact custom fields.
    
    Args:
        payload: GHL webhook payload
        customer_contact: Optional customer contact dict (for fallback)
        
    Returns:
        Recurring price as float, or None if not found
    """
    # 1) Try payload.get("Recurring Price") first
    recurring_price_raw = payload.get("Recurring Price")
    if recurring_price_raw is not None:
        try:
            # Handle int/float/str; normalize to float
            if isinstance(recurring_price_raw, (int, float)):
                recurring_price = float(recurring_price_raw)
            elif isinstance(recurring_price_raw, str):
                # Remove $ and commas, then parse
                cleaned = recurring_price_raw.replace("$", "").replace(",", "").strip()
                if cleaned:
                    recurring_price = float(cleaned)
                else:
                    recurring_price = None
            else:
                recurring_price = None
            
            # Treat 0 or empty as None
            if recurring_price is not None and recurring_price > 0:
                logger.info("RECURRING_PRICE_SOURCE source=payload value=%.2f", recurring_price)
                return recurring_price
            else:
                logger.info("RECURRING_PRICE_SOURCE source=payload value=%s (treated as None)", recurring_price_raw)
        except (ValueError, TypeError) as e:
            logger.warning("RECURRING_PRICE_SOURCE source=payload value=%s parse_error=%s", recurring_price_raw, e)
    
    # 2) Fallback to customer contact custom fields
    if customer_contact:
        try:
            from ..pricing import extract_contact_pricing_from_custom_fields
            pricing_data = extract_contact_pricing_from_custom_fields(customer_contact)
            recurring_price = pricing_data.get("recurring_price")  # Already a float or None
            if recurring_price is not None and recurring_price > 0:
                logger.info("RECURRING_PRICE_SOURCE source=contact_custom_fields value=%.2f", recurring_price)
                return recurring_price
        except Exception as e:
            logger.warning("RECURRING_PRICE_SOURCE source=contact_custom_fields exception=%s", e)
    
    logger.info("RECURRING_PRICE_SOURCE source=none value=None")
    return None


def generate_offer_code() -> str:
    """
    Generate a unique 5-digit code (10000-99999).
    
    Returns:
        5-digit code string
    """
    # Generate random 5-digit code
    # Note: Uniqueness is ensured by storing in GHL Job custom object
    return str(random.randint(10000, 99999))


def resolve_job_record_id_with_retries(candidates: List[str], max_attempts: int = 6, sleep_seconds: float = 1.0) -> Tuple[Optional[str], Optional[str]]:
    """
    Attempt to resolve a job record ID by trying multiple candidate external_job_ids with retries.
    
    Args:
        candidates: List of candidate external_job_ids to try
        max_attempts: Maximum number of attempts per candidate
        sleep_seconds: Seconds to sleep between attempts
    
    Returns:
        Tuple of (record_id, external_job_id_used) if found, (None, first_candidate) otherwise
    """
    if not candidates:
        return (None, None)
    
    first_candidate = candidates[0] if candidates else None
    logger.info("JOB_RECORD_RESOLVE_START candidates=%s", candidates)
    
    for candidate in candidates:
        if not candidate:
            continue
        
        for attempt in range(1, max_attempts + 1):
            record_id = find_job_record_id(candidate)
            found = record_id is not None
            logger.info("JOB_RECORD_RESOLVE_ATTEMPT external_job_id=%s attempt=%d found=%s record_id=%s",
                       candidate, attempt, found, record_id)
            
            if found:
                return (record_id, candidate)
            
            # Sleep before next attempt (except on last attempt)
            if attempt < max_attempts:
                time.sleep(sleep_seconds)
    
    logger.warning("JOB_RECORD_RESOLVE_FAILED candidates=%s", candidates)
    return (None, first_candidate)


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

    # Extract opportunity_id from payload - try multiple locations (prioritize payload.id)
    payload_id = payload.get("id")
    opportunity_id_from_opportunity = payload.get("opportunity", {}).get("id") if isinstance(payload.get("opportunity"), dict) else None
    opportunity_id = (
        payload_id or  # First priority: payload.id is often the opportunity id in GHL payloads
        payload.get("opportunity_id") or
        payload.get("opportunityId") or
        opportunity_id_from_opportunity
    )
    
    # Log resolution details
    relevant_keys = []
    if payload_id:
        relevant_keys.append("payload.id")
    if payload.get("opportunity_id"):
        relevant_keys.append("opportunity_id")
    if payload.get("opportunityId"):
        relevant_keys.append("opportunityId")
    if opportunity_id_from_opportunity:
        relevant_keys.append("opportunity.id")
    
    logger.info("DISPATCH_OPPORTUNITY_ID_RESOLVE payload_id=%s resolved=%s keys_present=%s",
               payload_id, opportunity_id, relevant_keys)
    
    if opportunity_id:
        job_summary["opportunity_id"] = opportunity_id
        logger.info("DISPATCH_OPPORTUNITY_ID opportunity_id=%s", opportunity_id)
    else:
        logger.warning("DISPATCH_OPPORTUNITY_ID opportunity_id=None (not found in payload)")

    # Capture multiple candidate external_job_ids from payload.calendar
    calendar = payload.get("calendar") or {}
    candidates = [
        calendar.get("appointmentId"),
        calendar.get("id"),
        payload.get("calendar", {}).get("appointmentId"),
        payload.get("calendar", {}).get("id"),
        payload.get("appointmentId"),
        payload.get("appointment_id"),
    ]
    # Filter out falsy and de-dup
    candidates = list(dict.fromkeys([c for c in candidates if c]))
    
    if not candidates:
        logger.warning("No candidate external_job_ids found in payload")

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

    # Generate offer code and resolve job record with retries
    offer_code = generate_offer_code()
    expires_at = datetime.utcnow() + timedelta(hours=24)
    expires_at_iso = expires_at.isoformat()
    
    # Resolve job record ID with retries (handles race condition where record may not exist yet)
    job_record_id, external_job_id_used = resolve_job_record_id_with_retries(candidates)
    
    # Store offer metadata in OFFER_STORE
    offer_metadata = {
        "code": offer_code,
        "external_job_id": external_job_id_used or (candidates[0] if candidates else None),
        "job_record_id": job_record_id,
        "opportunity_id": opportunity_id,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": expires_at_iso,
    }
    OFFER_STORE[offer_code] = offer_metadata
    
    # Save offer code to Job custom object if record_id was found
    if job_record_id:
        update_success = update_job_offer_code_by_record_id(
            job_record_id,
            offer_code,
            expires_at_iso,
            opportunity_id
        )
        if update_success:
            logger.info("OFFER_CODE_CREATED code=%s external_job_id=%s job_record_id=%s opportunity_id=%s saved to Job custom object",
                       offer_code, external_job_id_used, job_record_id, opportunity_id)
        else:
            logger.warning("OFFER_CODE_CREATED code=%s but failed to save to Job custom object job_record_id=%s",
                          offer_code, job_record_id)
    else:
        logger.warning("OFFER_CODE_CREATED code=%s external_job_id=%s job_record_id=None (will resolve on acceptance) opportunity_id=%s",
                      offer_code, external_job_id_used, opportunity_id)

    # PHASE 1: Write to Supabase (system of record) - non-blocking
    # Note: This runs after offer_code and external_job_id_used are defined
    logger.info(
        "SUPA_WRITE_ATTEMPT route=/dispatch ghl_opportunity_id=%s external_job_id=%s offer_code=%s",
        opportunity_id,
        external_job_id_used or (candidates[0] if candidates else None),
        offer_code
    )
    
    try:
        from ..supabase_client import (
            upsert_job,
            upsert_external_mapping,
            resolve_opportunity_id_from_ghl,
            resolve_contact_id_from_ghl,
            find_external_mapping,
            create_opportunity,
            get_vertical_id_by_slug,
        )
        from ..settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        
        has_url = bool(SUPABASE_URL)
        has_key = bool(SUPABASE_SERVICE_ROLE_KEY)
        
        logger.info(
            "SUPA_WRITE_ATTEMPT route=/dispatch config_check has_url=%s has_key=%s has_opportunity_id=%s",
            has_url,
            has_key,
            bool(opportunity_id)
        )
        
        if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and opportunity_id:
            # Resolve Supabase opportunity UUID from GHL opportunity_id (check if mapping exists)
            supabase_opportunity_id = resolve_opportunity_id_from_ghl(opportunity_id)
            
            logger.info(
                "SUPA_WRITE_ATTEMPT route=/dispatch step=opportunity_resolve ghl_opportunity_id=%s supabase_opportunity_id=%s",
                opportunity_id,
                supabase_opportunity_id
            )
            
            # If mapping doesn't exist, try to find existing Supabase opportunity for this contact
            # (created in /leads/cleaning) and create the mapping
            if not supabase_opportunity_id:
                import requests
                
                # Resolve contact_id from GHL contact_id in job_summary
                ghl_contact_id = job_summary.get("contact_id") or job_summary.get("customer_contact_id")
                if ghl_contact_id:
                    supabase_contact_id = resolve_contact_id_from_ghl(ghl_contact_id)
                    if supabase_contact_id:
                        # Look for existing opportunity for this contact (created in /leads/cleaning)
                        from ..supabase_client import _get_base_url, _get_headers
                        base_url = _get_base_url()
                        headers = _get_headers()
                        opportunities_url = f"{base_url}/opportunities"
                        # LEGACY: contact-based opportunity lookup (do not extend). TODO: migrate to person_id / dual key.
                        opportunities_params = {
                            "select": "id",
                            "primary_contact_id": f"eq.{supabase_contact_id}",
                            "status": "eq.open",
                            "order": "created_at.desc",
                            "limit": "1",
                        }
                        
                        try:
                            opp_response = requests.get(
                                opportunities_url, headers=headers, params=opportunities_params, timeout=10
                            )
                            if opp_response.ok:
                                opp_data = opp_response.json()
                                if opp_data and len(opp_data) > 0:
                                    supabase_opportunity_id = opp_data[0].get("id")
                                    logger.info(
                                        "SUPA_WRITE_ATTEMPT route=/dispatch step=opportunity_found_for_contact ghl_opportunity_id=%s supabase_opportunity_id=%s supabase_contact_id=%s",
                                        opportunity_id,
                                        supabase_opportunity_id,
                                        supabase_contact_id
                                    )
                                    
                                    # Create the external mapping
                                    try:
                                        mapping_result = upsert_external_mapping(
                                            source="ghl",
                                            entity_type="opportunity",
                                            external_id=opportunity_id,
                                            internal_id=supabase_opportunity_id,
                                            internal_table="opportunities",
                                            raw={"ghl_opportunity_id": opportunity_id},
                                        )
                                        logger.info(
                                            "SUPA_WRITE_SUCCESS route=/dispatch step=opportunity_mapping_create status=%s ghl_opportunity_id=%s supabase_opportunity_id=%s",
                                            mapping_result.get("status"),
                                            opportunity_id,
                                            supabase_opportunity_id
                                        )
                                    except Exception as e:
                                        logger.error(
                                            "SUPA_WRITE_FAILED route=/dispatch step=opportunity_mapping_create ghl_opportunity_id=%s supabase_opportunity_id=%s error=%s",
                                            opportunity_id,
                                            supabase_opportunity_id,
                                            str(e),
                                            exc_info=True
                                        )
                        except Exception as e:
                            logger.warning(
                                "SUPA_WRITE_FAILED route=/dispatch step=opportunity_lookup_for_contact ghl_contact_id=%s error=%s",
                                ghl_contact_id,
                                str(e)
                            )
                    
                    # If still no opportunity found, create one with external_id = ghl_opportunity_id
                    if not supabase_opportunity_id and supabase_contact_id:
                        try:
                            # Determine vertical from service_type (default to "cleaning")
                            service_type = job_summary.get("service_type", "Cleaning").lower()
                            vertical_slug = "cleaning"  # Default, can be enhanced later
                            if "gutter" in service_type:
                                vertical_slug = "gutters"
                            
                            vertical_id = get_vertical_id_by_slug(vertical_slug)
                            if not vertical_id:
                                logger.warning(
                                    "SUPA_WRITE_FAILED route=/dispatch step=vertical_lookup slug=%s error=not_found",
                                    vertical_slug
                                )
                            else:
                                # Extract opportunity data from job_summary
                                customer_name = job_summary.get("customer_name", "Unknown")
                                estimated_price = job_summary.get("estimated_price")
                                price_breakdown = job_summary.get("price_breakdown")
                                
                                # Build opportunity payload
                                opportunity_name = f"{customer_name} — {job_summary.get('service_type', 'Cleaning')}"
                                opportunity_metadata = {
                                    "vertical": vertical_slug,
                                    "ghl_opportunity_id": opportunity_id,
                                    "ghl_contact_id": ghl_contact_id,
                                    "service_type": job_summary.get("service_type"),
                                    "estimated_price": str(estimated_price) if estimated_price else None,
                                    "price_breakdown": price_breakdown,
                                    "full_address": job_summary.get("full_address"),
                                    "postal_code": job_summary.get("postal_code"),
                                }
                                
                                opportunity_payload = {
                                    "vertical_id": vertical_id,
                                    "primary_contact_id": supabase_contact_id,
                                    "name": opportunity_name,
                                    "status": "open",
                                    "source": "ghl",
                                    "external_id": opportunity_id,  # Store GHL opportunity_id as external_id
                                    "metadata": opportunity_metadata,
                                }
                                
                                # Add monetary value if available
                                if estimated_price:
                                    try:
                                        price_float = float(estimated_price) if isinstance(estimated_price, str) else estimated_price
                                        opportunity_payload["monetary_value_cents"] = int(price_float * 100)
                                    except (ValueError, TypeError):
                                        pass
                                
                                # Create opportunity
                                created_opp = create_opportunity(opportunity_payload)
                                supabase_opportunity_id = created_opp.get("id")
                                
                                logger.info(
                                    "SUPA_WRITE_SUCCESS route=/dispatch step=opportunity_create ghl_opportunity_id=%s supabase_opportunity_id=%s supabase_contact_id=%s vertical_slug=%s job_date=%s quote_total=%s estimated_price_cents=%s",
                                    opportunity_id,
                                    supabase_opportunity_id,
                                    supabase_contact_id,
                                    vertical_slug,
                                    job_summary.get("job_date"),
                                    job_summary.get("quote_total"),
                                    opportunity_payload.get("monetary_value_cents"),
                                )
                                
                                # Create the external mapping
                                try:
                                    mapping_result = upsert_external_mapping(
                                        source="ghl",
                                        entity_type="opportunity",
                                        external_id=opportunity_id,
                                        internal_id=supabase_opportunity_id,
                                        internal_table="opportunities",
                                        raw={"ghl_opportunity_id": opportunity_id},
                                    )
                                    logger.info(
                                        "SUPA_WRITE_SUCCESS route=/dispatch step=opportunity_mapping_create status=%s ghl_opportunity_id=%s supabase_opportunity_id=%s",
                                        mapping_result.get("status"),
                                        opportunity_id,
                                        supabase_opportunity_id
                                    )
                                except Exception as e:
                                    logger.error(
                                        "SUPA_WRITE_FAILED route=/dispatch step=opportunity_mapping_create ghl_opportunity_id=%s supabase_opportunity_id=%s error=%s",
                                        opportunity_id,
                                        supabase_opportunity_id,
                                        str(e),
                                        exc_info=True
                                    )
                        except Exception as e:
                            logger.error(
                                "SUPA_WRITE_FAILED route=/dispatch step=opportunity_create ghl_opportunity_id=%s error=%s",
                                opportunity_id,
                                str(e),
                                exc_info=True
                            )
            
            if supabase_opportunity_id:
                # Extract schedule info from job_summary
                start_time_iso = job_summary.get("start_time_iso") or job_summary.get("start_time")
                end_time = job_summary.get("end_time")
                job_date = job_summary.get("job_date")
                job_time_window = job_summary.get("job_time_window")
                
                # Schedule timezone for metadata: payload keys → ALLOY_DEFAULT_BUSINESS_TIMEZONE → UTC
                timezone_str = resolve_schedule_timezone_iana_str(job_summary)
                
                # Extract pricing info for structured logging
                estimated_price = job_summary.get("estimated_price")
                quote_total = job_summary.get("quote_total")
                estimated_price_cents = None
                if estimated_price:
                    try:
                        price_float = float(estimated_price) if isinstance(estimated_price, str) else estimated_price
                        estimated_price_cents = int(price_float * 100)
                    except (ValueError, TypeError):
                        pass
                
                # Build job payload
                job_title = f"{job_summary.get('customer_name', 'Unknown')} — {job_summary.get('service_type', 'Cleaning')}"
                job_description = f"Service: {job_summary.get('service_type', 'Cleaning')}\n"
                if job_summary.get("full_address"):
                    job_description += f"Address: {job_summary.get('full_address')}\n"
                if job_summary.get("postal_code"):
                    job_description += f"ZIP: {job_summary.get('postal_code')}\n"
                if job_summary.get("access_method"):
                    job_description += f"Access: {job_summary.get('access_method')}\n"
                if job_summary.get("access_notes"):
                    job_description += f"Access Notes: {job_summary.get('access_notes')}\n"
                
                # Store schedule info in metadata
                job_metadata = {
                    "ghl_opportunity_id": opportunity_id,
                    "ghl_contact_id": job_summary.get("contact_id"),
                    "ghl_external_job_id": external_job_id_used or (candidates[0] if candidates else None),
                    "ghl_job_record_id": job_record_id,
                    "schedule": {
                        "start_at": start_time_iso,
                        "end_at": end_time,
                        "timezone": timezone_str,
                        "status": "scheduled",  # Initial status
                    },
                    "service_type": job_summary.get("service_type"),
                    "estimated_price": job_summary.get("estimated_price"),
                    "price_breakdown": job_summary.get("price_breakdown"),
                    "full_address": job_summary.get("full_address"),
                    "postal_code": job_summary.get("postal_code"),
                    "access_method": job_summary.get("access_method"),
                    "access_notes": job_summary.get("access_notes"),
                    "offer_code": offer_code,
                    "dispatched_at": job_summary.get("dispatched_at"),
                }
                
                job_payload = {
                    "opportunity_id": supabase_opportunity_id,
                    "title": job_title,
                    "description": job_description.strip(),
                    "metadata": job_metadata,
                }
                
                # Check if job already exists via external_mapping
                existing_job_mapping = None
                if external_job_id_used:
                    existing_job_mapping = find_external_mapping("ghl", "job", external_job_id_used, "jobs")
                
                supabase_job_id = None
                if existing_job_mapping:
                    supabase_job_id = existing_job_mapping.get("internal_id")
                    # Update existing job
                    supabase_job = upsert_job(job_payload, supabase_job_id)
                    logger.info(
                        "SUPA_WRITE_SUCCESS route=/dispatch step=job_update supabase_job_id=%s supabase_opportunity_id=%s ghl_job_id=%s offer_code=%s",
                        supabase_job.get("id"),
                        supabase_opportunity_id,
                        external_job_id_used,
                        offer_code
                    )
                else:
                    # Create new job
                    supabase_job = upsert_job(job_payload)
                    supabase_job_id = supabase_job.get("id")
                    logger.info(
                        "SUPA_WRITE_SUCCESS route=/dispatch step=job_create supabase_job_id=%s supabase_opportunity_id=%s ghl_job_id=%s offer_code=%s job_date=%s job_time_window=%s quote_total=%s estimated_price_cents=%s",
                        supabase_job_id,
                        supabase_opportunity_id,
                        external_job_id_used,
                        offer_code,
                        job_date,
                        job_time_window,
                        quote_total,
                        estimated_price_cents
                    )
                
                # Create external_mapping for job (GHL job/appointment ID → Supabase job UUID)
                if external_job_id_used and supabase_job_id:
                    try:
                        job_mapping_result = upsert_external_mapping(
                            source="ghl",
                            entity_type="job",
                            external_id=external_job_id_used,
                            internal_id=supabase_job_id,
                            internal_table="jobs",
                            raw={
                                "ghl_opportunity_id": opportunity_id,
                                "ghl_contact_id": job_summary.get("contact_id"),
                                "ghl_job_record_id": job_record_id,
                                "appointment_id": external_job_id_used,
                            },
                        )
                        logger.info(
                            "SUPA_WRITE_SUCCESS route=/dispatch step=external_mapping_job status=%s supabase_job_id=%s ghl_job_id=%s",
                            job_mapping_result.get("status"),
                            supabase_job_id,
                            external_job_id_used
                        )
                    except Exception as e:
                        logger.error(
                            "SUPA_WRITE_FAILED route=/dispatch step=external_mapping_job supabase_job_id=%s ghl_job_id=%s error=%s",
                            supabase_job_id,
                            external_job_id_used,
                            str(e),
                            exc_info=True
                        )
                        # Continue - mapping failure should not abort the flow
            else:
                logger.warning(
                    "SUPA_WRITE_FAILED route=/dispatch step=opportunity_resolve ghl_opportunity_id=%s error=mapping_not_found_and_creation_failed, skipping job creation",
                    opportunity_id
                )
        else:
            logger.warning(
                "SUPA_WRITE_FAILED route=/dispatch error=config_or_opportunity_missing has_url=%s has_key=%s has_opportunity_id=%s",
                has_url,
                has_key,
                bool(opportunity_id)
            )
    except Exception as e:
        # Non-blocking: log error but don't fail the request
        logger.error(
            "SUPA_WRITE_FAILED route=/dispatch ghl_opportunity_id=%s external_job_id=%s offer_code=%s error=%s",
            opportunity_id,
            external_job_id_used or (candidates[0] if candidates else None),
            offer_code,
            str(e),
            exc_info=True
        )

    # Fetch customer contact to get bedrooms/bathrooms
    bedrooms = None
    bathrooms = None
    customer_contact = None
    customer_contact_id = job_summary.get("contact_id")
    if customer_contact_id:
        try:
            customer_contact = get_contact_by_id(customer_contact_id)
            if customer_contact:
                bedrooms, bathrooms = extract_bedrooms_bathrooms_from_contact(customer_contact)
                logger.info("BEDROOMS_BATHROOMS_RESOLVED customer_contact_id=%s bedrooms=%s bathrooms=%s",
                           customer_contact_id, bedrooms, bathrooms)
        except Exception as e:
            logger.warning("CUSTOMER_CONTACT_FETCH_FAILED customer_contact_id=%s exception=%s",
                          customer_contact_id, e)
    
    # Get recurring_price from payload first, then fallback to contact custom fields
    recurring_price = get_recurring_price_numeric(payload, customer_contact)
    
    # Use numeric values directly (no parsing for contractor pay)
    first_clean_price = float(job_summary.get("estimated_price", 0))
    
    # Compute contractor pay from numeric values
    contractor_pay_first_clean = math.floor(first_clean_price * 0.70) if first_clean_price > 0 else 0
    contractor_pay_recurring = math.floor(recurring_price * 0.70) if recurring_price is not None and recurring_price > 0 else None
    
    if contractor_pay_recurring is not None:
        logger.info("CONTRACTOR_PAY_RECURRING_COMPUTED recurring_price=%.2f contractor_pay_recurring=%d",
                   recurring_price, contractor_pay_recurring)
    else:
        reason = "recurring_price_is_None_or_zero" if recurring_price is None else "contractor_pay_recurring_is_None"
        logger.info("RECURRING_CONTRACTOR_PAY_SKIPPED_NUMERIC reason=%s", reason)
    
    logger.info("CONTRACTOR_PAY_COMPUTED_NUMERIC first_clean_price=%.2f recurring_price=%s contractor_pay_first_clean=%d contractor_pay_recurring=%s",
               first_clean_price, recurring_price, contractor_pay_first_clean, contractor_pay_recurring)
    
    # Parse price_breakdown ONLY for presentation (frequency_label, discount_label for SMS formatting)
    from ..pricing import parse_simplified_price_breakdown
    price_breakdown_raw = job_summary.get("price_breakdown", "")
    parsed_breakdown = parse_simplified_price_breakdown(price_breakdown_raw) if price_breakdown_raw else {}
    frequency_label = parsed_breakdown.get("frequency_label")
    discount_label = parsed_breakdown.get("discount_label")
    
    # Enhance price breakdown with beds/baths and contractor pay (presentation only)
    # Pass pre-computed contractor pay values to ensure they're used in formatting
    enhanced_price_breakdown, _, _ = (
        enhance_price_breakdown_with_beds_baths_and_contractor_pay(
            price_breakdown_raw,
            bedrooms,
            bathrooms,
            first_clean_price,
            recurring_price,
            frequency_label,
            discount_label,
            contractor_pay_first_clean=contractor_pay_first_clean,
            contractor_pay_recurring=contractor_pay_recurring,
        )
    )
    
    # Store contractor_pay_amount on Job custom object
    if job_record_id and contractor_pay_first_clean:
        update_success = update_job_custom_field_by_record_id(
            job_record_id,
            JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY,
            contractor_pay_first_clean
        )
        if update_success:
            logger.info("CONTRACTOR_PAY_STORED_ON_JOB code=%s job_record_id=%s contractor_pay_amount=%d",
                       offer_code, job_record_id, contractor_pay_first_clean)
        else:
            logger.warning("CONTRACTOR_PAY_STORE_FAILED code=%s job_record_id=%s contractor_pay_amount=%d",
                          offer_code, job_record_id, contractor_pay_first_clean)
    
    # Store recurring_contractor_pay_amount on Job custom object
    if job_record_id and contractor_pay_recurring is not None:
        update_success = update_job_custom_field_by_record_id(
            job_record_id,
            JOBS_RECURRING_CONTRACTOR_PAY_AMOUNT_FIELD_KEY,
            contractor_pay_recurring
        )
        if update_success:
            logger.info("RECURRING_CONTRACTOR_PAY_STORED_ON_JOB code=%s job_record_id=%s value=%d",
                       offer_code, job_record_id, contractor_pay_recurring)
        else:
            logger.warning("RECURRING_CONTRACTOR_PAY_STORE_FAILED code=%s job_record_id=%s value=%d",
                          offer_code, job_record_id, contractor_pay_recurring)
    else:
        reason = "recurring_price_is_None_or_zero" if recurring_price is None else "contractor_pay_recurring_is_None"
        logger.info("RECURRING_CONTRACTOR_PAY_SKIPPED_NUMERIC code=%s reason=%s", offer_code, reason)
    
    # Store contractor_pay_amount and enhanced_price_breakdown in offer metadata for later use
    if contractor_pay_first_clean:
        offer_metadata["contractor_pay_amount"] = contractor_pay_first_clean
    if contractor_pay_recurring is not None:
        offer_metadata["recurring_contractor_pay_amount"] = contractor_pay_recurring
    # Always store enhanced_price_breakdown for winner SMS (works for both recurring and one-time)
    if enhanced_price_breakdown:
        offer_metadata["enhanced_price_breakdown"] = enhanced_price_breakdown
    
    # Store contractor_pay_amount on Opportunity if available
    if opportunity_id and OPP_CONTRACTOR_PAY_AMOUNT and contractor_pay_first_clean:
        opp_update_success = update_opportunity_custom_field(
            opportunity_id,
            OPP_CONTRACTOR_PAY_AMOUNT,
            str(contractor_pay_first_clean)
        )
        logger.info("OPP_CONTRACTOR_PAY_UPDATE opportunity_id=%s field_id=%s value=%d success=%s",
                   opportunity_id, OPP_CONTRACTOR_PAY_AMOUNT, contractor_pay_first_clean, opp_update_success)
    
    # Store recurring_contractor_pay_amount on Opportunity if available
    if opportunity_id and OPP_RECURRING_CONTRACTOR_PAY_AMOUNT and contractor_pay_recurring is not None:
        opp_recurring_update_success = update_opportunity_custom_field(
            opportunity_id,
            OPP_RECURRING_CONTRACTOR_PAY_AMOUNT,
            str(contractor_pay_recurring)
        )
        logger.info("OPP_RECURRING_CONTRACTOR_PAY_UPDATE opportunity_id=%s field_id=%s value=%d success=%s",
                   opportunity_id, OPP_RECURRING_CONTRACTOR_PAY_AMOUNT, contractor_pay_recurring, opp_recurring_update_success)
    elif opportunity_id and contractor_pay_recurring is None:
        reason = "recurring_price_is_None_or_zero" if recurring_price is None else "contractor_pay_recurring_is_None"
        logger.info("OPP_RECURRING_CONTRACTOR_PAY_UPDATE_SKIPPED opportunity_id=%s reason=%s", opportunity_id, reason)
    elif opportunity_id and not OPP_RECURRING_CONTRACTOR_PAY_AMOUNT:
        logger.warning("OPP_RECURRING_CONTRACTOR_PAY_UPDATE_SKIPPED opportunity_id=%s (OPP_RECURRING_CONTRACTOR_PAY_AMOUNT not configured)", opportunity_id)
    
    # Format friendly date/time
    _offer_sms_tz = resolve_friendly_display_tz(job_summary)
    friendly_datetime = format_datetime_friendly(
        job_summary.get("start_time_iso") or job_summary.get("start_time"),
        job_summary.get("start_time", "TBD"),
        display_tz=_offer_sms_tz,
    )

    # Build contractor SMS message (NO access info yet – only broadcast)
    postal_code = job_summary.get("postal_code", "")
    zip_line = f"ZIP: {postal_code}\n" if postal_code else ""
    price_breakdown_line = f"Price breakdown:\n{enhanced_price_breakdown}\n" if enhanced_price_breakdown else ""
    
    # Determine job type and add-ons presence for logging
    job_type = "recurring" if (recurring_price is not None and recurring_price > 0) else "one_time"
    has_recurring = recurring_price is not None and recurring_price > 0
    has_addons = "Add-ons:" in (enhanced_price_breakdown or "") or "add-ons:" in (enhanced_price_breakdown or "").lower()
    has_price_breakdown = bool(enhanced_price_breakdown)
    
    msg = (
        f"New cleaning job available\n"
        f"Customer: {job_summary['customer_name']}\n"
        f"Service: {job_summary['service_type']}\n"
        f"When: {friendly_datetime}\n"
        f"{zip_line}"
        f"{price_breakdown_line}"
        f"\nReply YES {offer_code} to accept."
    )

    # Log before sending offer SMS
    logger.info("SMS_OFFER_RENDER job_type=%s has_recurring=%s has_addons=%s has_price_breakdown=%s",
               job_type, has_recurring, has_addons, has_price_breakdown)

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

    # Look up job by offer code from GHL Job custom object
    if not offer_code:
        logger.warning("OFFER_ACCEPT_INVALID reason=no_code_provided contractor_id=%s", contact_id)
        rejection_msg = "Invalid code. Please reply with the 5-digit code from the job offer."
        send_conversation_sms(contact_id, rejection_msg)
        return JSONResponse(
            {
                "ok": False,
                "reason": "invalid_code",
                "message_text": message_text,
                "code": None,
            },
            status_code=200,
        )
    
    # Resolve job record by offer_code (primary method)
    job_record_id = find_job_record_id_by_offer_code(offer_code)
    
    if not job_record_id:
        # Invalid code - send rejection message
        logger.warning("OFFER_ACCEPT_INVALID reason=code_not_found contractor_id=%s code=%s", 
                      contact_id, offer_code)
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
    
    # Fetch the full job record to get properties
    job_record = get_job_record(job_record_id)
    if not job_record:
        logger.error("OFFER_ACCEPT_ERROR reason=record_fetch_failed contractor_id=%s code=%s record_id=%s",
                    contact_id, offer_code, job_record_id)
        send_conversation_sms(contact_id, "Error processing your acceptance. Please contact support.")
        return JSONResponse(
            {
                "ok": False,
                "reason": "record_fetch_failed",
                "code": offer_code,
            },
            status_code=200,
        )
    
    # Extract job info from Job custom object record
    # Handle nested structure: properties may be at top level or in record.properties
    properties = (
        job_record.get("properties") or
        job_record.get("record", {}).get("properties") or
        {}
    )
    
    job_id = properties.get("external_job_id")
    customer_contact_id = properties.get("customer_contact_id") or properties.get("contact_id")
    opportunity_id = (
        properties.get("opportunity_id") or
        properties.get(JOBS_OPPORTUNITY_ID_FIELD_KEY) or
        properties.get("opportunityId") or
        properties.get("Opportunity ID")
    )
    expires_at_str = (
        properties.get("offer_expires_at") or
        properties.get(JOBS_OFFER_EXPIRES_AT_FIELD_KEY) or
        properties.get("offerExpiresAt")
    )
    
    # Log opportunity_id resolution
    opportunity_keys_present = [k for k in ["opportunity_id", JOBS_OPPORTUNITY_ID_FIELD_KEY, "opportunityId", "Opportunity ID"] 
                               if properties.get(k)]
    logger.info("OFFER_ACCEPT_OPPORTUNITY_ID_RESOLVE resolved=%s keys_present=%s all_property_keys=%s",
               opportunity_id, opportunity_keys_present, list(properties.keys())[:20] if isinstance(properties, dict) else [])
    
    # Check expiration
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=ZoneInfo("UTC"))
            if datetime.now(ZoneInfo("UTC")) > expires_at:
                logger.warning("OFFER_ACCEPT_INVALID reason=expired contractor_id=%s code=%s", 
                              contact_id, offer_code)
                send_conversation_sms(contact_id, "This offer has expired. Please wait for a new job offer.")
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
    
    # Get job from JOB_STORE (optional - we have all info from job_record now)
    job = JOB_STORE.get(job_id) if job_id else None

    if not job:
        # Build minimal job dict from job_record if not in JOB_STORE
        logger.warning(
            "contractor-reply: job not found in JOB_STORE. job_id=%s, building from job_record",
            job_id,
        )
        job = {
            "job_id": job_id,  # Ensure job_id is set from properties
            "customer_name": properties.get("customer_name") or "Unknown",
            "start_time": properties.get("start_time") or "TBD",
            "start_time_iso": properties.get("start_time_iso") or "",
            "full_address": properties.get("full_address") or "",
            "access_method": properties.get("how_will_your_cleaner_get_into_your_home") or properties.get("access_method") or "Not specified",
            "access_notes": properties.get("access_notes_for_your_cleaner") or properties.get("access_notes") or "",
            "price_breakdown": properties.get("price_breakdown") or "",
            "contact_id": properties.get("contact_id") or "",
        }
    else:
        # Ensure job_id is set even if job was in JOB_STORE
        if not job.get("job_id") and job_id:
            job["job_id"] = job_id

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

    # Update job assignment first (using record_id directly)
    job_updated = False
    if job_record_id:
        # Pass job_id if available, but record_id takes precedence
        upsert_job_assignment_to_ghl(
            job_id or "",  # May be empty, but record_id will be used
            contact_id or "",
            contractor_name or "",
            record_id=job_record_id
        )
        job_updated = True
        logger.info("OFFER_ACCEPT_JOB_UPDATED code=%s job_record_id=%s job_id=%s", 
                   offer_code, job_record_id, job_id)
    else:
        logger.error("OFFER_ACCEPT_ERROR reason=no_record_id code=%s", offer_code)
    
    # Get contractor_pay_amount, recurring_contractor_pay_amount, and enhanced_price_breakdown from offer metadata or job record
    contractor_pay_amount = None
    recurring_contractor_pay_amount = None
    enhanced_price_breakdown_for_winner = None
    offer = OFFER_STORE.get(offer_code)
    if offer:
        contractor_pay_amount = offer.get("contractor_pay_amount")
        recurring_contractor_pay_amount = offer.get("recurring_contractor_pay_amount")
        enhanced_price_breakdown_for_winner = offer.get("enhanced_price_breakdown")
    
    if not contractor_pay_amount:
        # Try to get from job record properties
        contractor_pay_amount = properties.get(JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY) or properties.get("contractor_pay_amount")
        if contractor_pay_amount:
            try:
                contractor_pay_amount = int(contractor_pay_amount)
            except (ValueError, TypeError):
                contractor_pay_amount = None
    
    if recurring_contractor_pay_amount is None:
        # Try to get from job record properties
        recurring_contractor_pay_amount = properties.get(JOBS_RECURRING_CONTRACTOR_PAY_AMOUNT_FIELD_KEY) or properties.get("recurring_contractor_pay_amount")
        if recurring_contractor_pay_amount:
            try:
                recurring_contractor_pay_amount = int(recurring_contractor_pay_amount)
            except (ValueError, TypeError):
                recurring_contractor_pay_amount = None
    
    # Store contractor_pay_amount on Job if not already stored
    if job_record_id and contractor_pay_amount:
        update_success = update_job_custom_field_by_record_id(
            job_record_id,
            JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY,
            contractor_pay_amount
        )
        logger.info("CONTRACTOR_PAY_STORED_ON_JOB_ACCEPTANCE code=%s job_record_id=%s contractor_pay_amount=%d success=%s",
                   offer_code, job_record_id, contractor_pay_amount, update_success)
    
    # Store recurring_contractor_pay_amount on Job if not already stored
    if job_record_id and recurring_contractor_pay_amount is not None:
        update_success = update_job_custom_field_by_record_id(
            job_record_id,
            JOBS_RECURRING_CONTRACTOR_PAY_AMOUNT_FIELD_KEY,
            recurring_contractor_pay_amount
        )
        logger.info("RECURRING_CONTRACTOR_PAY_STORED_ON_JOB_ACCEPTANCE code=%s job_record_id=%s recurring_contractor_pay_amount=%d success=%s",
                   offer_code, job_record_id, recurring_contractor_pay_amount, update_success)
    
    # Update Opportunity custom field with assigned contractor name (for GHL workflow merge fields)
    if opportunity_id and OPP_ASSIGNED_CONTRACTOR_FIELD_ID and contractor_name:
        opp_update_success = update_opportunity_custom_field(
            opportunity_id,
            OPP_ASSIGNED_CONTRACTOR_FIELD_ID,
            contractor_name
        )
        logger.info("OPP_ASSIGNED_CONTRACTOR_UPDATE opportunity_id=%s field_id=%s value=%s success=%s",
                   opportunity_id, OPP_ASSIGNED_CONTRACTOR_FIELD_ID, contractor_name, opp_update_success)
    elif opportunity_id and not OPP_ASSIGNED_CONTRACTOR_FIELD_ID:
        logger.warning("OPP_ASSIGNED_CONTRACTOR_UPDATE skipped: opportunity_id=%s but OPP_ASSIGNED_CONTRACTOR_FIELD_ID not configured",
                      opportunity_id)
    elif not opportunity_id:
        logger.info("OPP_ASSIGNED_CONTRACTOR_UPDATE skipped: opportunity_id missing from job record")
    
    # Update Opportunity custom field with contractor pay amount
    if opportunity_id and OPP_CONTRACTOR_PAY_AMOUNT and contractor_pay_amount:
        opp_pay_update_success = update_opportunity_custom_field(
            opportunity_id,
            OPP_CONTRACTOR_PAY_AMOUNT,
            str(contractor_pay_amount)
        )
        logger.info("OPP_CONTRACTOR_PAY_UPDATE_ACCEPTANCE opportunity_id=%s field_id=%s value=%d success=%s",
                   opportunity_id, OPP_CONTRACTOR_PAY_AMOUNT, contractor_pay_amount, opp_pay_update_success)
    elif opportunity_id and not OPP_CONTRACTOR_PAY_AMOUNT:
        logger.warning("OPP_CONTRACTOR_PAY_UPDATE_ACCEPTANCE skipped: opportunity_id=%s but OPP_CONTRACTOR_PAY_AMOUNT not configured",
                      opportunity_id)
    elif not opportunity_id:
        logger.info("OPP_CONTRACTOR_PAY_UPDATE_ACCEPTANCE skipped: opportunity_id missing from job record")
    
    # Update Opportunity custom field with recurring contractor pay amount
    if opportunity_id and OPP_RECURRING_CONTRACTOR_PAY_AMOUNT and recurring_contractor_pay_amount is not None:
        opp_recurring_pay_update_success = update_opportunity_custom_field(
            opportunity_id,
            OPP_RECURRING_CONTRACTOR_PAY_AMOUNT,
            str(recurring_contractor_pay_amount)
        )
        logger.info("OPP_RECURRING_CONTRACTOR_PAY_UPDATE_ACCEPTANCE opportunity_id=%s field_id=%s value=%d success=%s",
                   opportunity_id, OPP_RECURRING_CONTRACTOR_PAY_AMOUNT, recurring_contractor_pay_amount, opp_recurring_pay_update_success)
    elif opportunity_id and recurring_contractor_pay_amount is None:
        logger.info("OPP_RECURRING_CONTRACTOR_PAY_UPDATE_ACCEPTANCE skipped: opportunity_id=%s (no recurring_contractor_pay_amount)",
                   opportunity_id)
    elif opportunity_id and not OPP_RECURRING_CONTRACTOR_PAY_AMOUNT:
        logger.warning("OPP_RECURRING_CONTRACTOR_PAY_UPDATE_ACCEPTANCE skipped: opportunity_id=%s but OPP_RECURRING_CONTRACTOR_PAY_AMOUNT not configured",
                      opportunity_id)

    # Update opportunity stage if opportunity_id is present
    stage_updated = False
    if opportunity_id and GHL_STAGE_ID_ASSIGNED:
        logger.info("OFFER_ACCEPT_UPDATING_STAGE opportunity_id=%s contractor_id=%s code=%s stage_id=%s",
                   opportunity_id, contact_id, offer_code, GHL_STAGE_ID_ASSIGNED)
        stage_updated = update_opportunity_stage(opportunity_id, GHL_STAGE_ID_ASSIGNED)
        logger.info("OFFER_ACCEPT_STAGE_UPDATE_RESULT stage_updated=%s opportunity_id=%s", 
                   stage_updated, opportunity_id)
    elif opportunity_id:
        logger.warning("OFFER_ACCEPT_NO_STAGE_ID code=%s opportunity_id=%s present but GHL_STAGE_ID_ASSIGNED not configured, skipping stage update",
                      offer_code, opportunity_id)
    else:
        logger.warning("OFFER_ACCEPT_NO_OPPORTUNITY_ID code=%s (opportunity_id missing from job record, skipping stage update)", offer_code)

    # Mark assignment in memory
    if job:
        job["assigned_contractor_id"] = contact_id
        job["assigned_contractor_name"] = contractor_name
    
    logger.info("contractor-reply: offer code=%s accepted, job assignment proceeding", offer_code)

    # 1) Confirm to the accepting contractor — including all details
    # Format date/time nicely using the same helper (same as offer SMS)
    start_time_iso = job.get("start_time_iso") or job.get("start_time")
    _winner_tz = resolve_friendly_display_tz(job)
    start_time_display = format_datetime_friendly(
        start_time_iso,
        "TBD",  # Only show TBD if no start_time exists
        display_tz=_winner_tz,
    )
    logger.info("OFFER_ACCEPT_WINNER_SMS_DATETIME start_time_iso=%s start_time_display=%s",
               start_time_iso, start_time_display)
    
    customer_name = job.get("customer_name", "Unknown")
    full_address = job.get("full_address", "")
    access_method = job.get("access_method", "Not specified")
    access_notes = job.get("access_notes", "")
    
    # Use enhanced_price_breakdown from offer metadata if available (same as offer SMS)
    # Otherwise fall back to job price_breakdown
    price_breakdown = enhanced_price_breakdown_for_winner or job.get("price_breakdown", "")
    if enhanced_price_breakdown_for_winner:
        logger.info("OFFER_ACCEPT_WINNER_SMS_PRICE_BREAKDOWN using enhanced_price_breakdown from offer metadata")
    else:
        logger.info("OFFER_ACCEPT_WINNER_SMS_PRICE_BREAKDOWN using job price_breakdown (enhanced not available)")
    
    # Determine job type for logging (check if recurring from offer metadata or job)
    has_recurring_pay = recurring_contractor_pay_amount is not None
    job_type_winner = "recurring" if has_recurring_pay else "one_time"
    has_price_breakdown_winner = bool(price_breakdown)
    
    # Log before sending winner SMS
    logger.info("SMS_WINNER_RENDER job_type=%s has_price_breakdown=%s when_value=%s",
               job_type_winner, has_price_breakdown_winner, start_time_display)
    
    # Fetch customer phone number from customer contact
    customer_phone = "Not available"
    if customer_contact_id:
        try:
            customer_contact = get_contact_by_id(customer_contact_id)
            if customer_contact:
                customer_phone = customer_contact.get("phone") or customer_contact.get("phoneNumber") or "Not available"
                logger.info("OFFER_ACCEPT_CUSTOMER_PHONE_FETCHED customer_contact_id=%s phone=%s",
                           customer_contact_id, customer_phone)
            else:
                logger.warning("OFFER_ACCEPT_CUSTOMER_PHONE_FETCH_FAILED customer_contact_id=%s (contact not found)",
                              customer_contact_id)
        except Exception as e:
            logger.warning("OFFER_ACCEPT_CUSTOMER_PHONE_FETCH_EXCEPTION customer_contact_id=%s exception=%s",
                          customer_contact_id, e)
    else:
        logger.warning("OFFER_ACCEPT_CUSTOMER_PHONE_SKIPPED customer_contact_id missing from job record")
    
    confirm_msg = f"✅ You got the job\n\n"
    confirm_msg += f"Date/Time: {start_time_display}\n"
    confirm_msg += f"Customer: {customer_name}\n"
    confirm_msg += f"Customer phone: {customer_phone}\n"
    
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
    # Get customer_name from job_record properties if available, fallback to job dict
    customer_name_for_notification = (
        properties.get("customer_name") or
        job.get("customer_name") or
        "a customer"
    )
    
    # Build notification message with offer_code (no date/time)
    claimed_msg = f"Job for {customer_name_for_notification} (Code {offer_code}) has been claimed by another contractor.\nReply STOP to unsubscribe.\nThanks, Alloy - Cleaning"
    
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
        send_conversation_sms(cid, claimed_msg)
        logger.info("OFFER_CLAIMED_NOTIFICATION sent to contractor_id=%s offer_code=%s", cid, offer_code)

    # 3) Notify the customer their job has been assigned (if we have their contact_id)
    customer_contact_id = job.get("contact_id")
    if customer_contact_id:
        customer_msg = (
            f"Your cleaning on {job['start_time']} has been assigned to one of our partner teams. "
            f"They will contact you before arrival."
        )
        send_conversation_sms(customer_contact_id, customer_msg)

    # Final success log
    logger.info("OFFER_ACCEPT_SUCCESS offer_code=%s record_id=%s opportunity_id=%s job_updated=%s stage_updated=%s",
               offer_code, job_record_id, opportunity_id, job_updated, stage_updated)

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

