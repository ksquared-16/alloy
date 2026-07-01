"""
Lead submission routes.
"""
import logging
import os
from typing import List as TypingList
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import EmailStr
from typing import Optional

from ..settings import CUSTOM_FIELD_IDS, MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES
from ..utils import normalize_phone, normalize_square_footage_option, build_booking_url
from ..pricing import calculate_pricing_from_form
from ..lead_processing import process_lead_async
from ..ghl_client import (
    create_or_update_contact_in_ghl,
    resolve_or_create_contact_canonical,
    build_custom_fields_from_env,
)
from ..models import ProsApplicationPayload

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()

# Batch 3.7: Canonical public cleaning booking is Next.js Book v2 (Supabase field registry + opportunities).
# This route remains a parallel path: multipart + GHL sync only — not the Alloy DB booking truth model.
# Product choice: keep for legacy/custom forms until explicitly redirected to /book-v2; do not extend as canonical.


@router.post("/leads/cleaning")
async def submit_cleaning_lead(
    background_tasks: BackgroundTasks,
    first_name: str = Form(...),
    last_name: str = Form(...),
    phone: str = Form(...),
    email: EmailStr = Form(...),
    postal_code: str = Form(...),
    home_type: str = Form(...),
    service_type: str = Form(...),
    approximate_square_footage: str = Form(...),
    cleaning_frequency: str = Form(...),
    preferred_service_date: Optional[str] = Form(None),
    extras_add_ons: Optional[str] = Form(None),
    addons__frequency: Optional[str] = Form(None),
    street_address: Optional[str] = Form(None),
    photos: TypingList[UploadFile] = File(default=[]),
    estimated_price: Optional[str] = Form(None),
):
    """
    Submit a cleaning lead from the new custom cleaning quote form (Phase 2).
    
    Accepts multipart/form-data to support file uploads for Move-Out / Heavy Clean photos.
    Returns immediately and processes GHL sync in background for fast UX.
    
    Args (multipart/form-data):
        - first_name, last_name, phone, email, postal_code
        - service_type, preferred_service_date, home_type
        - cleaning_frequency, extras_add_ons, addons__frequency, approximate_square_footage
        - street_address (optional, required for Move-Out)
        - photos (optional, multiple files, required for Move-Out)
        - estimated_price (optional, frontend-calculated price to sync to GHL)

    Returns:
        JSON: { "ok": true, "status": "accepted", "phone": "+1..." }
        Always returns 202 immediately, GHL sync happens in background.

    Side effects (background):
        - Creates or updates a contact in GHL with standard and custom fields
        - Uploads photos to GHL Media API (for Move-Out / Heavy Clean)
        - Maps form fields to GHL custom fields using CUSTOM_FIELD_IDS
        - Adds tags and creates notes
    """
    # Validate required fields
    if not all([first_name, last_name, phone, email, postal_code, home_type, service_type, approximate_square_footage, cleaning_frequency]):
        return JSONResponse(
            {"ok": False, "status": "error", "message": "Missing required fields"},
            status_code=400,
        )
    
    phone_normalized = normalize_phone(phone)
    
    # Check if this is a Move-Out / Heavy Clean request
    is_move_out = service_type and "Move-Out" in service_type
    
    # Validate photos for Move-Out requests
    if is_move_out:
        if len(photos) < 4:
            return JSONResponse(
                {"ok": False, "error": "Please upload at least 4 photos."},
                status_code=400,
            )
        if len(photos) > MAX_PHOTOS:
            return JSONResponse(
                {"ok": False, "error": f"Please upload up to {MAX_PHOTOS} photos."},
                status_code=400,
            )
        
        # Validate photo sizes
        total_bytes = 0
        for photo_file in photos:
            try:
                # Read file to check size (we'll read again for background task)
                file_content = await photo_file.read()
                file_size = len(file_content)
                
                if file_size > MAX_PHOTO_BYTES:
                    return JSONResponse(
                        {"ok": False, "error": f"Photo '{photo_file.filename}' is too large. Please upload photos under 5MB each."},
                        status_code=400,
                    )
                
                total_bytes += file_size
                
                # Reset file pointer for background task
                await photo_file.seek(0)
            except Exception as e:
                logger.warning("leads_cleaning: failed to read photo %s: %s", photo_file.filename, e)
                return JSONResponse(
                    {"ok": False, "error": f"Failed to process photo '{photo_file.filename}'."},
                    status_code=400,
                )
        
        if total_bytes > MAX_TOTAL_PHOTO_BYTES:
            return JSONResponse(
                {"ok": False, "error": "Total photo size exceeds 20MB. Please reduce photo sizes."},
                status_code=400,
            )
        
        logger.info(
            "leads_cleaning: validated %d photos, total_bytes=%d for Move-Out request",
            len(photos),
            total_bytes
        )
        # Log each photo's filename and size
        for idx, photo_file in enumerate(photos):
            try:
                await photo_file.seek(0)  # Reset if needed
                file_content = await photo_file.read()
                file_size = len(file_content)
                logger.info(
                    "leads_cleaning: photo[%d] filename=%s size_bytes=%d content_type=%s",
                    idx,
                    photo_file.filename or f"photo_{idx}.jpg",
                    file_size,
                    photo_file.content_type or "image/jpeg"
                )
                await photo_file.seek(0)  # Reset for background task
            except Exception as e:
                logger.warning("leads_cleaning: failed to read photo[%d] %s: %s", idx, photo_file.filename, e)
    
    # Read photos into memory (needed for background task)
    photos_data = []
    if photos:
        for idx, photo_file in enumerate(photos):
            try:
                file_content = await photo_file.read()
                photos_data.append({
                    "filename": photo_file.filename or f"photo_{idx}.jpg",
                    "content": file_content,
                    "content_type": photo_file.content_type or "image/jpeg",
                })
                logger.info(
                    "leads_cleaning: loaded photo[%d] into memory filename=%s size_bytes=%d",
                    idx,
                    photos_data[-1]["filename"],
                    len(file_content)
                )
            except Exception as e:
                logger.warning("leads_cleaning: failed to read photo %s: %s", photo_file.filename, e)
    
    # Validate required custom field env vars
    missing_required_env_vars = []
    if not CUSTOM_FIELD_IDS.get("cleaning_frequency"):
        missing_required_env_vars.append("GHL_CF_CLEANING_FREQUENCY")
    if not CUSTOM_FIELD_IDS.get("square_footage") and not CUSTOM_FIELD_IDS.get("approximate_square_footage"):
        missing_required_env_vars.append("GHL_CF_SQUARE_FOOTAGE or GHL_CF_APPROXIMATE_SQUARE_FOOTAGE")
    
    if missing_required_env_vars:
        logger.error(
            "submit_cleaning_lead: MISSING REQUIRED custom field env vars: %s. "
            "Contact will be created but cleaning_frequency and/or square_footage will NOT be populated in GHL.",
            ", ".join(missing_required_env_vars)
        )
    
    # Calculate pricing from form data
    pricing = calculate_pricing_from_form(
        service_type=service_type,
        approximate_square_footage=approximate_square_footage,
        cleaning_frequency=cleaning_frequency,
        extras_add_ons=extras_add_ons,
    )
    
    calculated_estimated_price = pricing["estimated_price"]
    calculated_price_breakdown = pricing["price_breakdown"]
    calculated_recurring_price = pricing["recurring_price"]
    
    logger.info(
        "pricing_calculated estimated_price=%.2f recurring_price=%s frequency=%s service_type=%s",
        calculated_estimated_price,
        calculated_recurring_price if calculated_recurring_price is not None else "None",
        cleaning_frequency,
        service_type
    )
    
    # FAST synchronous contact upsert (for booking URL continuity)
    # Build custom field mapping
    custom_field_mapping = {}
    if service_type and service_type.strip():
        custom_field_mapping["service_type"] = service_type.strip()
    if preferred_service_date and preferred_service_date.strip():
        custom_field_mapping["preferred_service_date"] = preferred_service_date.strip()
    if home_type and home_type.strip():
        custom_field_mapping["home_type"] = home_type.strip()
    if cleaning_frequency and cleaning_frequency.strip():
        custom_field_mapping["cleaning_frequency"] = cleaning_frequency.strip()
    
    # Normalize and validate square footage
    normalized_sqft = normalize_square_footage_option(approximate_square_footage)
    if normalized_sqft:
        custom_field_mapping["approximate_square_footage"] = normalized_sqft
        custom_field_mapping["square_footage"] = normalized_sqft
    
    # Parse extras_add_ons if provided
    if extras_add_ons:
        try:
            import json
            extras_list = json.loads(extras_add_ons)
            if not isinstance(extras_list, list):
                extras_list = [extras_add_ons]
        except Exception:
            extras_list = [x.strip() for x in extras_add_ons.split(",") if x.strip()]
        if extras_list:
            custom_field_mapping["extras_add_ons"] = "\n".join(str(v) for v in extras_list if v)
    
    if addons__frequency and addons__frequency.strip():
        custom_field_mapping["addons__frequency"] = addons__frequency.strip()
    if street_address and street_address.strip():
        custom_field_mapping["street_address"] = street_address.strip()
    
    # Add pricing fields
    custom_field_mapping["estimated_price"] = str(calculated_estimated_price)
    custom_field_mapping["price_breakdown"] = calculated_price_breakdown
    if calculated_recurring_price is not None:
        custom_field_mapping["recurring_price"] = str(calculated_recurring_price)
    
    # Use canonical contact resolution (email-first, then phone, then create with duplicate recovery)
    # Default to "cleaning" vertical for backward compatibility
    vertical_key = "cleaning"
    # Store vertical_key in custom fields for tracking
    custom_field_mapping["vertical"] = vertical_key
    contact_id, resolution_path = resolve_or_create_contact_canonical(
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone_normalized,
        postal_code=postal_code,
        custom_field_mapping=custom_field_mapping,
        estimated_price=str(calculated_estimated_price),
        price_breakdown=calculated_price_breakdown,
        recurring_price=str(calculated_recurring_price) if calculated_recurring_price is not None else None,
        vertical_key=vertical_key,
    )
    
    logger.info(
        "submit_cleaning_lead: endpoint hit contact_id=%s resolution_path=%s phone=%s email=%s",
        contact_id,
        resolution_path,
        phone_normalized[:4] + "***" if phone_normalized else "None",
        email[:10] + "***" if email else "None"
    )
    
    if not contact_id:
        logger.error("submit_cleaning_lead: failed to create/update contact")
        return JSONResponse(
            {"ok": False, "status": "error", "message": "Failed to create contact"},
            status_code=500,
        )
    
    # PHASE 1: Write to Supabase (system of record) - non-blocking
    # Mask PII for logging
    email_masked = (email or "")[:3] + "***" if email else None
    phone_masked = (phone_normalized or "")[:4] + "***" if phone_normalized else None
    
    logger.info(
        "SUPA_WRITE_ATTEMPT route=/leads/cleaning ghl_contact_id=%s email=%s phone=%s vertical_key=%s",
        contact_id,
        email_masked,
        phone_masked,
        vertical_key
    )
    
    try:
        from ..supabase_client import (
            upsert_contact,
            find_or_create_opportunity,
            upsert_external_mapping,
            get_vertical_id_by_slug,
            resolve_contact_id_from_ghl,
        )
        from ..settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        
        has_url = bool(SUPABASE_URL)
        has_key = bool(SUPABASE_SERVICE_ROLE_KEY)
        
        logger.info(
            "SUPA_WRITE_ATTEMPT route=/leads/cleaning config_check has_url=%s has_key=%s",
            has_url,
            has_key
        )
        
        if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
            # 1. Resolve Supabase contact_id using deterministic order:
            # Priority 1: GHL contact_id via external_mappings
            # Priority 2: Email lookup
            # Priority 3: Phone lookup
            # Priority 4: Create new
            from ..supabase_client import find_contact_by_email, find_contact_by_phone
            
            supabase_contact_id = None
            contact_resolution_path = None
            
            # Priority 1: GHL contact_id mapping
            if contact_id:
                supabase_contact_id = resolve_contact_id_from_ghl(contact_id)
                if supabase_contact_id:
                    contact_resolution_path = "mapping"
                    logger.info(
                        "CONTACT_RESOLVE path=mapping contact_id=%s ghl_contact_id=%s",
                        supabase_contact_id[:8] + "***" if len(supabase_contact_id) > 8 else supabase_contact_id,
                        contact_id
                    )
            
            # Priority 2: Email lookup
            if not supabase_contact_id and email:
                existing_contact = find_contact_by_email(email.strip().lower())
                if existing_contact:
                    supabase_contact_id = existing_contact.get("id")
                    contact_resolution_path = "email"
                    logger.info(
                        "CONTACT_RESOLVE path=email contact_id=%s email=%s",
                        supabase_contact_id[:8] + "***" if len(supabase_contact_id) > 8 else supabase_contact_id,
                        email[:3] + "***"
                    )
            
            # Priority 3: Phone lookup
            if not supabase_contact_id and phone_normalized:
                existing_contact = find_contact_by_phone(phone_normalized)
                if existing_contact:
                    supabase_contact_id = existing_contact.get("id")
                    contact_resolution_path = "phone"
                    logger.info(
                        "CONTACT_RESOLVE path=phone contact_id=%s phone=%s",
                        supabase_contact_id[:8] + "***" if len(supabase_contact_id) > 8 else supabase_contact_id,
                        phone_normalized[:4] + "***"
                    )
            
            # Priority 4: Create new contact
            supabase_contact_payload = {
                "first_name": first_name.strip(),
                "last_name": last_name.strip(),
                "email": email.strip().lower() if email else None,
                "phone": phone_normalized,
                "contact_type": "lead",
                "metadata": {
                    "postal_code": postal_code,
                    "home_type": home_type,
                    "service_type": service_type,
                    "approximate_square_footage": approximate_square_footage,
                    "cleaning_frequency": cleaning_frequency,
                    "preferred_service_date": preferred_service_date,
                    "street_address": street_address,
                    "extras_add_ons": extras_add_ons,
                    "addons__frequency": addons__frequency,
                    "estimated_price": str(calculated_estimated_price),
                    "price_breakdown": calculated_price_breakdown,
                    "recurring_price": str(calculated_recurring_price) if calculated_recurring_price else None,
                    "vertical": vertical_key,
                    "app_env": os.getenv("NEXT_PUBLIC_APP_ENV") or "production",
                },
            }
            
            if supabase_contact_id:
                # Update existing contact
                supabase_contact = upsert_contact(supabase_contact_payload, internal_id=supabase_contact_id)
            else:
                # Create new contact
                supabase_contact = upsert_contact(supabase_contact_payload)
                supabase_contact_id = supabase_contact.get("id")
                contact_resolution_path = "created"
                logger.info(
                    "CONTACT_RESOLVE path=created contact_id=%s email=%s phone=%s",
                    supabase_contact_id[:8] + "***" if len(supabase_contact_id) > 8 else supabase_contact_id,
                    email[:3] + "***" if email else "None",
                    phone_normalized[:4] + "***" if phone_normalized else "None"
                )
            
            logger.info(
                "SUPA_WRITE_SUCCESS route=/leads/cleaning step=contact_upsert path=%s supabase_contact_id=%s ghl_contact_id=%s email=%s phone=%s",
                contact_resolution_path or "unknown",
                supabase_contact_id,
                contact_id,
                email_masked,
                phone_masked
            )
            
            # 2. Ensure external_mapping exists for contact (GHL ID → Supabase UUID)
            # This is idempotent - safe to call even if mapping already exists
            try:
                mapping_result = upsert_external_mapping(
                    source="ghl",
                    entity_type="contact",
                    external_id=contact_id,
                    internal_id=supabase_contact_id,
                    internal_table="contacts",
                    raw={"ghl_contact_id": contact_id},  # Store minimal GHL reference
                )
                logger.info(
                    "SUPA_WRITE_SUCCESS route=/leads/cleaning step=external_mapping_contact status=%s supabase_contact_id=%s ghl_contact_id=%s",
                    mapping_result.get("status"),
                    supabase_contact_id,
                    contact_id
                )
            except Exception as e:
                logger.error(
                    "SUPA_WRITE_FAILED route=/leads/cleaning step=external_mapping_contact supabase_contact_id=%s ghl_contact_id=%s error=%s",
                    supabase_contact_id,
                    contact_id,
                    str(e),
                    exc_info=True
                )
                # Continue - external mapping failure should not abort opportunity creation
            
            # 3. Get vertical_id for "cleaning"
            vertical_id = get_vertical_id_by_slug("cleaning")
            if not vertical_id:
                logger.warning("SUPA_WRITE_FAILED route=/leads/cleaning step=vertical_lookup slug=cleaning error=not_found, skipping opportunity creation")
            else:
                # 4. Create opportunity in Supabase
                opportunity_name = f"{first_name} {last_name} — {service_type}"
                opportunity_metadata = {
                    "vertical": vertical_key,
                    "app_env": os.getenv("NEXT_PUBLIC_APP_ENV") or "production",
                    "intake": {
                        "postal_code": postal_code,
                        "home_type": home_type,
                        "service_type": service_type,
                        "approximate_square_footage": approximate_square_footage,
                        "cleaning_frequency": cleaning_frequency,
                        "preferred_service_date": preferred_service_date,
                        "street_address": street_address,
                        "extras_add_ons": extras_add_ons,
                        "addons__frequency": addons__frequency,
                    },
                    "estimated_price": str(calculated_estimated_price),
                    "price_breakdown": calculated_price_breakdown,
                    "recurring_price": str(calculated_recurring_price) if calculated_recurring_price else None,
                    "ghl_contact_id": contact_id,  # Store GHL contact ID for reference
                }
                
                opportunity_payload = {
                    "vertical_id": vertical_id,
                    "primary_contact_id": supabase_contact_id,
                    "name": opportunity_name,
                    "status": "open",
                    "source": "website",
                    "monetary_value_cents": int(calculated_estimated_price * 100) if calculated_estimated_price else None,
                    "metadata": opportunity_metadata,
                }
                # Person-first when the compatibility contact row already links to persons.person_id (canonical CRM reads).
                supa_person_id = (
                    supabase_contact.get("person_id") if isinstance(supabase_contact, dict) else None
                )
                if supa_person_id and str(supa_person_id).strip():
                    opportunity_payload["primary_person_id"] = str(supa_person_id).strip()
                
                # Use idempotent find_or_create (checks mapping first, then recent window)
                opp_result = find_or_create_opportunity(
                    opportunity_payload,
                    ghl_opportunity_id=None,  # Not available at lead time
                    supabase_contact_id=supabase_contact_id,
                )
                supabase_opportunity = opp_result.get("opportunity")
                supabase_opportunity_id = supabase_opportunity.get("id")
                opp_status = opp_result.get("status")
                
                logger.info(
                    "SUPA_WRITE_SUCCESS route=/leads/cleaning step=opportunity_create status=%s supabase_opportunity_id=%s supabase_contact_id=%s ghl_contact_id=%s vertical_key=%s",
                    opp_status,
                    supabase_opportunity_id,
                    supabase_contact_id,
                    contact_id,
                    vertical_key
                )
                
                # Note: GHL opportunity_id will be created later when booking happens
                # We'll create that external_mapping in the dispatch webhook
        else:
            logger.warning(
                "SUPA_WRITE_FAILED route=/leads/cleaning error=config_missing has_url=%s has_key=%s ghl_contact_id=%s",
                has_url,
                has_key,
                contact_id
            )
    except Exception as e:
        # Non-blocking: log error but don't fail the request
        logger.error(
            "SUPA_WRITE_FAILED route=/leads/cleaning ghl_contact_id=%s email=%s phone=%s error=%s",
            contact_id,
            email_masked,
            phone_masked,
            str(e),
            exc_info=True
        )
    
    # Build booking URL
    booking_url = build_booking_url(
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone_normalized,
        contact_id=contact_id,
    )
    
    # Add background task for heavy work (tags, photos, notes)
    # Default to "cleaning" vertical for backward compatibility
    vertical_key = "cleaning"
    background_tasks.add_task(
        process_lead_async,
        first_name=first_name,
        last_name=last_name,
        phone=phone_normalized,  # Use normalized phone
        email=email,
        postal_code=postal_code,
        home_type=home_type,
        service_type=service_type,
        approximate_square_footage=approximate_square_footage,
        cleaning_frequency=cleaning_frequency,
        preferred_service_date=preferred_service_date,
        extras_add_ons=extras_add_ons,
        addons__frequency=addons__frequency,
        street_address=street_address,
        photos_data=photos_data,
        estimated_price=str(calculated_estimated_price),
        price_breakdown=calculated_price_breakdown,
        recurring_price=str(calculated_recurring_price) if calculated_recurring_price is not None else None,
        vertical_key=vertical_key,
    )
    
    # Return immediately with contact_id and booking_url
    return JSONResponse(
        {
            "ok": True,
            "status": "accepted",
            "normalized_phone": phone_normalized,
            "contact_id": contact_id,
            "booking_url": booking_url,
            "estimated_price": calculated_estimated_price,
            "recurring_price": calculated_recurring_price,
            "price_breakdown": calculated_price_breakdown,
        },
        status_code=200,  # OK - contact created/updated synchronously
    )


@router.post("/leads/pros")
async def submit_pros_application(payload: ProsApplicationPayload):
    """
    Submit a pros (contractor) application from the frontend.

    Args (request body):
        - name: Applicant full name
        - phone: Applicant phone number
        - email: Applicant email
        - experience: Optional experience description
        - notes: Optional additional notes

    Returns:
        JSON with ok=True and contact_id if successful.

    Side effects:
        - Creates or updates a contact in GHL with pros application information
        - Tags the contact for pros recruitment review
    """
    logger.info("Received pros application: %s", payload.dict())

    custom_fields = {}
    if payload.experience:
        custom_fields["experience"] = payload.experience
    if payload.notes:
        custom_fields["notes"] = payload.notes

    # Add tag to indicate this is a pros application
    custom_fields["tags"] = ["pros_application", "website_lead"]

    contact_id = create_or_update_contact_in_ghl(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        custom_fields=custom_fields,
    )

    if not contact_id:
        raise HTTPException(
            status_code=500,
            detail="Failed to submit application. Please try again or contact support.",
        )

    return JSONResponse(
        {
            "ok": True,
            "contact_id": contact_id,
            "message": "Application submitted successfully. We'll review and contact you soon.",
        }
    )

