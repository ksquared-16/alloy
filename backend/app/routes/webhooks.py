"""
Webhook endpoints for GHL events.
"""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..utils import normalize_phone
from ..ghl_client import (
    find_contact_record_by_phone,
    search_contact_by_phone,
    ensure_contact_has_tag,
    create_contact_note,
)

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


@router.post("/webhooks/ghl/appointment-created")
async def webhook_appointment_created(request: Request):
    """
    Webhook endpoint to reconcile duplicate contacts when GHL creates an appointment.
    
    When a user books via the GHL booking page, GHL may create a new contact even if
    we prefilled the form. This webhook reconciles by:
    1. Finding the original lead contact (via lead_contact_id param or phone/email search)
    2. Tagging both contacts appropriately
    3. Adding notes for tracking
    
    Args (request body):
        GHL webhook payload containing:
        - contact_id: GHL contact ID of the booking contact
        - calendar/appointmentId: Appointment ID
        - first_name, last_name, phone, email: Contact info
        - customData: May contain lead_contact_id from booking URL params
    
    Returns:
        JSON with ok=True and reconciliation details
    """
    try:
        payload = await request.json()
        logger.info("webhook_appointment_created: received payload keys=%s", list(payload.keys()))
        
        # Extract booking contact info
        booking_contact_id = (
            payload.get("contact_id")
            or payload.get("contactId")
            or payload.get("calendar", {}).get("contactId")
        )
        
        booking_phone = (
            payload.get("phone")
            or payload.get("calendar", {}).get("phone")
            or ""
        )
        booking_email = (
            payload.get("email")
            or payload.get("calendar", {}).get("email")
            or ""
        )
        
        appointment_id = (
            payload.get("appointmentId")
            or payload.get("calendar", {}).get("appointmentId")
            or payload.get("appointment_id")
        )
        
        # Check for lead_contact_id in customData or query params
        custom_data = payload.get("customData") or {}
        lead_contact_id = custom_data.get("lead_contact_id")
        
        # Also check URL query params if present in payload
        if not lead_contact_id:
            # Some webhook formats include query params in the payload
            lead_contact_id = payload.get("lead_contact_id")
        
        logger.info(
            "webhook_appointment_created: booking_contact_id=%s appointment_id=%s lead_contact_id=%s phone=%s",
            booking_contact_id,
            appointment_id,
            lead_contact_id,
            booking_phone[:4] + "***" if booking_phone and len(booking_phone) > 4 else "***"
        )
        
        if not booking_contact_id:
            logger.warning("webhook_appointment_created: no booking_contact_id in payload")
            return JSONResponse(
                {"ok": False, "error": "Missing contact_id in payload"},
                status_code=400,
            )
        
        # Normalize booking phone
        booking_phone_normalized = normalize_phone(booking_phone) if booking_phone else None
        
        # Find original lead contact
        original_contact_id = None
        
        # Method 1: Use lead_contact_id from customData/query params
        if lead_contact_id:
            logger.info("webhook_appointment_created: using lead_contact_id from params: %s", lead_contact_id)
            original_contact_id = lead_contact_id
        # Method 2: Search by phone
        elif booking_phone_normalized:
            logger.info("webhook_appointment_created: searching for original contact by phone: %s", booking_phone_normalized[:4] + "***")
            original_contact = search_contact_by_phone(booking_phone_normalized)
            if original_contact:
                original_contact_id = original_contact.get("id")
                logger.info("webhook_appointment_created: found original contact_id=%s by phone", original_contact_id)
        
        # If booking contact is the same as original, no reconciliation needed
        if original_contact_id == booking_contact_id:
            logger.info(
                "webhook_appointment_created: booking_contact_id matches original, no reconciliation needed"
            )
            # Still tag as booked
            ensure_contact_has_tag(booking_contact_id, "booked")
            if appointment_id:
                create_contact_note(
                    booking_contact_id,
                    "Appointment Booked",
                    f"Appointment created: {appointment_id}",
                )
            return JSONResponse(
                {
                    "ok": True,
                    "action": "no_reconciliation_needed",
                    "contact_id": booking_contact_id,
                }
            )
        
        # Reconciliation needed
        if original_contact_id:
            logger.info(
                "webhook_appointment_created: reconciling original_contact_id=%s booking_contact_id=%s",
                original_contact_id,
                booking_contact_id
            )
            
            # Tag original lead contact as booked
            ensure_contact_has_tag(original_contact_id, "booked")
            
            # Add note to original contact
            note_body = f"Appointment booked via GHL booking page.\n"
            if appointment_id:
                note_body += f"Appointment ID: {appointment_id}\n"
            note_body += f"Booking contact ID: {booking_contact_id}"
            create_contact_note(original_contact_id, "Appointment Booked", note_body)
            
            # Tag booking contact as duplicate
            ensure_contact_has_tag(booking_contact_id, "duplicate_booking_contact")
            
            # Add note to booking contact
            create_contact_note(
                booking_contact_id,
                "Duplicate Booking Contact",
                f"Created during booking. Original lead contact: {original_contact_id}",
            )
            
            return JSONResponse(
                {
                    "ok": True,
                    "action": "reconciled",
                    "original_contact_id": original_contact_id,
                    "booking_contact_id": booking_contact_id,
                    "phone": booking_phone_normalized,
                }
            )
        else:
            # Could not find original contact
            logger.warning(
                "webhook_appointment_created: could not find original contact for booking_contact_id=%s phone=%s",
                booking_contact_id,
                booking_phone_normalized
            )
            # Still tag as booked (may be a new customer)
            ensure_contact_has_tag(booking_contact_id, "booked")
            if appointment_id:
                create_contact_note(
                    booking_contact_id,
                    "Appointment Booked",
                    f"Appointment created: {appointment_id}",
                )
            return JSONResponse(
                {
                    "ok": True,
                    "action": "no_original_found",
                    "booking_contact_id": booking_contact_id,
                    "phone": booking_phone_normalized,
                }
            )
            
    except Exception as e:
        logger.error(
            "webhook_appointment_created: exception: %s",
            e,
            exc_info=True
        )
        return JSONResponse(
            {"ok": False, "error": str(e)},
            status_code=500,
        )

