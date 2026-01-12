"""
Lead processing and background task orchestration.
"""
import json
import time
import logging
import traceback
from typing import Dict, Any, List, Optional

from .settings import MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES
from .utils import normalize_phone, normalize_square_footage_option
from .pricing import calculate_pricing_from_form
from .ghl_client import (
    ensure_contact_has_tag,
    upload_photo_to_ghl,
    create_contact_note,
)

logger = logging.getLogger("alloy-dispatcher")


def process_lead_async(
    first_name: str,
    last_name: str,
    phone: str,
    email: str,
    postal_code: str,
    home_type: str,
    service_type: str,
    approximate_square_footage: str,
    cleaning_frequency: str,
    preferred_service_date: Optional[str],
    extras_add_ons: Optional[str],
    addons__frequency: Optional[str],
    street_address: Optional[str],
    photos_data: List[Dict[str, Any]],  # List of {filename, content, content_type}
    estimated_price: Optional[str] = None,  # Frontend-calculated price
    price_breakdown: Optional[str] = None,  # Price breakdown text
    recurring_price: Optional[str] = None,  # Recurring price value
    vertical_key: str = "cleaning",  # Vertical identifier (defaults to "cleaning" for backward compatibility)
):
    """
    Background task to process lead submission and sync with GHL.
    Includes timing instrumentation for performance monitoring.
    """
    t_start = time.perf_counter()
    contact_id = None
    phone_normalized = normalize_phone(phone)
    
    try:
        # Parse extras_add_ons if provided as JSON string
        extras_list = None
        if extras_add_ons:
            try:
                extras_list = json.loads(extras_add_ons)
                if not isinstance(extras_list, list):
                    extras_list = [extras_add_ons]
            except Exception:
                # If not JSON, treat as comma-separated string
                extras_list = [x.strip() for x in extras_add_ons.split(",") if x.strip()]
        
        # Build custom field mapping (only include non-empty values)
        custom_field_mapping = {}
        if service_type and service_type.strip():
            custom_field_mapping["service_type"] = service_type.strip()
        if preferred_service_date and preferred_service_date.strip():
            custom_field_mapping["preferred_service_date"] = preferred_service_date.strip()
        if home_type and home_type.strip():
            custom_field_mapping["home_type"] = home_type.strip()
        if cleaning_frequency and cleaning_frequency.strip():
            custom_field_mapping["cleaning_frequency"] = cleaning_frequency.strip()
        if extras_list:
            custom_field_mapping["extras_add_ons"] = "\n".join(str(v) for v in extras_list if v)
        if addons__frequency and addons__frequency.strip():
            custom_field_mapping["addons__frequency"] = addons__frequency.strip()
        
        # Normalize and validate square footage before adding to custom fields
        normalized_sqft = normalize_square_footage_option(approximate_square_footage)
        if normalized_sqft:
            # Support both keys: approximate_square_footage and square_footage
            custom_field_mapping["approximate_square_footage"] = normalized_sqft
            custom_field_mapping["square_footage"] = normalized_sqft
            logger.info(
                "process_lead_async: square_footage_normalized raw=%s normalized=%s",
                approximate_square_footage,
                normalized_sqft
            )
        elif approximate_square_footage:
            logger.warning(
                "process_lead_async: square_footage_invalid raw=%s (not in allowed GHL dropdown values, skipping)",
                approximate_square_footage
            )
        
        if street_address and street_address.strip():
            custom_field_mapping["street_address"] = street_address.strip()
        
        # Store vertical_key in custom fields for tracking
        custom_field_mapping["vertical"] = vertical_key
        
        # Check if this is a Move-Out / Heavy Clean request
        is_move_out = service_type and "Move-Out" in service_type
        
        # Handle photo uploads for Move-Out / Heavy Clean
        t_photos_start = time.perf_counter()
        photo_urls = []
        total_photo_bytes = 0
        if is_move_out and photos_data:
            total_photo_bytes = sum(len(p.get("content", b"")) for p in photos_data)
            logger.info(
                "process_lead_async: uploading %d photo(s) to GHL Media API, total_bytes=%d",
                len(photos_data),
                total_photo_bytes
            )
            # Log each photo's details before upload
            for idx, photo_data in enumerate(photos_data):
                filename = photo_data.get("filename", f"photo_{idx}")
                photo_size = len(photo_data.get("content", b""))
                logger.info(
                    "process_lead_async: photo[%d] filename=%s size_bytes=%d content_type=%s",
                    idx,
                    filename,
                    photo_size,
                    photo_data.get("content_type", "image/jpeg")
                )
            
            for idx, photo_data in enumerate(photos_data):
                filename = photo_data.get("filename", f"photo_{idx}")
                try:
                    file_url = upload_photo_to_ghl(
                        photo_data["content"],
                        filename,
                        photo_data.get("content_type", "image/jpeg")
                    )
                    if file_url:
                        photo_urls.append(file_url)
                        # Log success with masked URL (first 50 chars)
                        logger.info(
                            "process_lead_async: photo[%d] uploaded successfully filename=%s fileUrl=%s",
                            idx,
                            filename,
                            file_url[:50] + "..." if len(file_url) > 50 else file_url
                        )
                    else:
                        logger.warning("process_lead_async: photo[%d] upload returned no fileUrl filename=%s", idx, filename)
                except Exception as e:
                    logger.error(
                        "process_lead_async: exception uploading photo[%d] filename=%s error=%s",
                        idx,
                        filename,
                        e,
                        exc_info=True
                    )
            
            # Store photo URLs in custom field
            if photo_urls:
                custom_field_mapping["estimate_photos"] = "\n".join(photo_urls)
                logger.info(
                    "lead_photos_uploaded contact_id=%s count=%d urls_saved=true",
                    contact_id or "pending",
                    len(photo_urls)
                )
            else:
                logger.warning(
                    "lead_photos_uploaded contact_id=%s count=%d urls_saved=false (no successful uploads)",
                    contact_id or "pending",
                    len(photos_data)
                )
        t_photos_ms = (time.perf_counter() - t_photos_start) * 1000
        
        # Use canonical contact resolution (email-first, then phone, then create with duplicate recovery)
        from .ghl_client import resolve_or_create_contact_canonical
        
        t_search_start = time.perf_counter()
        contact_id, resolution_path = resolve_or_create_contact_canonical(
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone_normalized,
            postal_code=postal_code,
            custom_field_mapping=custom_field_mapping if custom_field_mapping else None,
            estimated_price=estimated_price,
            price_breakdown=price_breakdown,
            recurring_price=recurring_price,
            vertical_key=vertical_key,
        )
        t_search_ms = (time.perf_counter() - t_search_start) * 1000
        
        # Determine action based on resolution path
        t_upsert_start = time.perf_counter()
        if resolution_path in ("email_search", "phone_search", "duplicate_recovered"):
            action = "updated"
            t_update_ms = (time.perf_counter() - t_upsert_start) * 1000
            t_create_ms = 0
        elif resolution_path == "created":
            action = "created"
            t_create_ms = (time.perf_counter() - t_upsert_start) * 1000
            t_update_ms = 0
        else:
            action = "error"
            t_create_ms = 0
            t_update_ms = 0
        
        if not contact_id:
            raise Exception("Failed to create or update contact")
        
        # Apply tags based on vertical (idempotent merge)
        t_tags_start = time.perf_counter()
        from .ghl_client import apply_ghl_tags
        apply_ghl_tags(contact_id, vertical_key)
        
        # Add move-out specific tag if needed
        if is_move_out:
            from .ghl_client import ensure_contact_has_tag
            ensure_contact_has_tag(contact_id, "manual_quote_needed")
        t_tags_ms = (time.perf_counter() - t_tags_start) * 1000
        
        # Create contact note for Move-Out with photos
        t_note_ms = 0
        if is_move_out and photo_urls:
            t_note_start = time.perf_counter()
            note_body_parts = []
            if street_address and street_address.strip():
                note_body_parts.append(f"Street Address: {street_address.strip()}")
            if preferred_service_date and preferred_service_date.strip():
                note_body_parts.append(f"Preferred Service Date: {preferred_service_date.strip()}")
            note_body_parts.append("")
            note_body_parts.append("Photo URLs:")
            for url in photo_urls:
                note_body_parts.append(url)
            note_body = "\n".join(note_body_parts)
            create_contact_note(contact_id, "Move-Out Estimate Photos", note_body)
            t_note_ms = (time.perf_counter() - t_note_start) * 1000
        
        t_total_ms = (time.perf_counter() - t_start) * 1000
        
        # Log timing breakdown
        logger.info(
            "lead_sync_timing contact_id=%s phone=%s total_ms=%.1f search_ms=%.1f create_ms=%.1f update_ms=%.1f tags_ms=%.1f photos_ms=%.1f note_ms=%.1f photo_count=%d photo_bytes=%d action=%s",
            contact_id,
            phone_normalized[:4] + "***" + phone_normalized[-2:] if len(phone_normalized) > 4 else "***",
            t_total_ms,
            t_search_ms,
            t_create_ms,
            t_update_ms,
            t_tags_ms,
            t_photos_ms,
            t_note_ms,
            len(photos_data) if photos_data else 0,
            total_photo_bytes,
            action,
        )
        
    except Exception as e:
        t_total_ms = (time.perf_counter() - t_start) * 1000
        error_msg = str(e)
        logger.error(
            "lead_sync_failed phone=%s total_ms=%.1f error=%s traceback=%s",
            phone_normalized[:4] + "***" + phone_normalized[-2:] if len(phone_normalized) > 4 else "***",
            t_total_ms,
            error_msg,
            traceback.format_exc(),
        )


