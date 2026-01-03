"""
Stripe webhook endpoints for SetupIntent events (card on file collection).
"""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Header, HTTPException
from fastapi.responses import JSONResponse
import stripe

from ..settings import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
from ..utils import normalize_phone
from ..ghl_client import (
    search_contact_by_phone,
    search_contact_by_email,
    add_tag_to_contact,
    get_contact_by_id,
)

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


@router.post("/stripe/setup-intent")
async def create_setup_intent(request: Request):
    """
    Create a Stripe SetupIntent for card-on-file collection (no charge).
    
    Input JSON body:
        {
            "phone": string (required),
            "email": string (required),
            "ghl_contact_id": string (optional)
        }
    
    Returns:
        {
            "client_secret": string
        }
    
    The SetupIntent will have:
    - usage="off_session" (for future charges)
    - metadata with ghl_contact_id, phone, email for webhook matching
    """
    try:
        body = await request.json()
    except Exception as e:
        logger.error("create_setup_intent: failed to parse JSON body: %s", e)
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    phone = body.get("phone")
    email = body.get("email")
    ghl_contact_id = body.get("ghl_contact_id")
    
    if not phone or not email:
        logger.error("create_setup_intent: missing required fields (phone=%s, email=%s)", bool(phone), bool(email))
        raise HTTPException(status_code=400, detail="phone and email are required")
    
    # Build metadata for webhook matching
    metadata = {
        "phone": phone,
        "email": email,
    }
    if ghl_contact_id:
        metadata["ghl_contact_id"] = ghl_contact_id
    
    try:
        # Create SetupIntent (not PaymentIntent - no charge)
        setup_intent = stripe.SetupIntent.create(
            usage="off_session",  # For future charges
            metadata=metadata,
        )
        
        logger.info(
            "create_setup_intent: created setup_intent_id=%s phone=%s email=%s ghl_contact_id=%s",
            setup_intent.id,
            phone[:4] + "***" if len(phone) > 4 else "***",
            email[:10] + "***" if len(email) > 10 else "***",
            ghl_contact_id or "None"
        )
        
        return JSONResponse(
            {"client_secret": setup_intent.client_secret},
            status_code=200
        )
    except stripe.error.StripeError as e:
        logger.error("create_setup_intent: Stripe error: %s", e)
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error("create_setup_intent: unexpected error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook endpoint for SetupIntent events.
    
    Handles:
    - setup_intent.succeeded: Tag contact with "card_on_file:collected"
    - setup_intent.setup_failed: Log only
    - Other events: Ignore (return 200)
    
    Args:
        request: FastAPI request object
    
    Returns:
        JSONResponse with status 200 for all events (Stripe requires 200)
    """
    # Get Stripe signature from headers (case-insensitive)
    stripe_signature = request.headers.get("stripe-signature")
    if not stripe_signature:
        logger.error("stripe_webhook: missing Stripe-Signature header")
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")
    
    # Get raw body for signature verification (MUST be bytes, not parsed JSON)
    body = await request.body()
    
    try:
        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            body, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        logger.error("stripe_webhook: invalid payload: %s", e)
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error("stripe_webhook: invalid signature: %s", e)
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    event_type = event.get("type")
    event_id = event.get("id")
    logger.info("stripe_webhook: received event type=%s id=%s", event_type, event_id)
    
    # Handle setup_intent.succeeded
    if event_type == "setup_intent.succeeded":
        setup_intent = event.get("data", {}).get("object", {})
        setup_intent_id = setup_intent.get("id")
        metadata = setup_intent.get("metadata", {})
        
        ghl_contact_id = metadata.get("ghl_contact_id")
        phone = metadata.get("phone")
        email = metadata.get("email")
        
        logger.info(
            "stripe_webhook: setup_intent.succeeded setup_intent_id=%s metadata=%s",
            setup_intent_id,
            metadata
        )
        
        contact_id_to_tag = None
        resolution_path = None
        
        # Try to find contact by ghl_contact_id first (if provided)
        if ghl_contact_id:
            # Validate the contact_id by attempting to fetch it
            contact = get_contact_by_id(ghl_contact_id)
            if contact:
                contact_id_to_tag = ghl_contact_id
                resolution_path = "ghl_contact_id"
                logger.info(
                    "stripe_webhook: validated ghl_contact_id=%s from metadata (path: ghl_contact_id)",
                    contact_id_to_tag
                )
            else:
                logger.warning(
                    "stripe_webhook: ghl_contact_id=%s from metadata is invalid (400/404), falling back to search",
                    ghl_contact_id
                )
        
        # Fallback: search by phone or email if ghl_contact_id not found or invalid
        if not contact_id_to_tag:
            if phone:
                phone_normalized = normalize_phone(phone)
                if phone_normalized:
                    contact = search_contact_by_phone(phone_normalized)
                    if contact:
                        contact_id_to_tag = contact.get("id")
                        resolution_path = "phone_search"
                        logger.info(
                            "stripe_webhook: found contact by phone: contact_id=%s phone=%s (path: phone_search)",
                            contact_id_to_tag,
                            phone_normalized[:4] + "***"
                        )
            
            if not contact_id_to_tag and email:
                contact = search_contact_by_email(email)
                if contact:
                    contact_id_to_tag = contact.get("id")
                    resolution_path = "email_search"
                    logger.info(
                        "stripe_webhook: found contact by email: contact_id=%s email=%s (path: email_search)",
                        contact_id_to_tag,
                        email[:10] + "***"
                    )
        
        # Tag the contact if found
        if contact_id_to_tag:
            tag = "card_on_file:collected"
            success = add_tag_to_contact(contact_id_to_tag, tag)
            if success:
                logger.info(
                    "stripe_webhook: tagged contact_id=%s with tag=%s event_id=%s resolution_path=%s",
                    contact_id_to_tag,
                    tag,
                    event_id,
                    resolution_path
                )
            else:
                logger.error(
                    "stripe_webhook: failed to tag contact_id=%s with tag=%s event_id=%s resolution_path=%s",
                    contact_id_to_tag,
                    tag,
                    event_id,
                    resolution_path
                )
        else:
            logger.warning(
                "stripe_webhook: could not find contact for setup_intent_id=%s metadata=%s event_id=%s (tried ghl_contact_id, phone, email)",
                setup_intent_id,
                metadata,
                event_id
            )
    
    # Handle setup_intent.setup_failed (log only)
    elif event_type == "setup_intent.setup_failed":
        setup_intent = event.get("data", {}).get("object", {})
        setup_intent_id = setup_intent.get("id")
        failure_reason = setup_intent.get("last_setup_error", {}).get("message", "Unknown")
        logger.warning(
            "stripe_webhook: setup_intent.setup_failed setup_intent_id=%s reason=%s event_id=%s",
            setup_intent_id,
            failure_reason,
            event_id
        )
    
    # Ignore other event types
    else:
        logger.debug("stripe_webhook: ignoring event type=%s event_id=%s", event_type, event_id)
    
    # Always return 200 (Stripe requires 200 for all events)
    return JSONResponse({"received": True}, status_code=200)

