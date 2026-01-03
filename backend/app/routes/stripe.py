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
    add_tag_to_contact,
)

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


def search_contact_by_email(email: str) -> Optional[Dict[str, Any]]:
    """
    Search for a contact by email using GHL Contacts Search API.
    
    Args:
        email: Email address (will be trimmed and lowercased)
    
    Returns:
        First matching contact dict if found, None otherwise
    """
    from ..settings import GHL_LOCATION_ID, CONTACTS_SEARCH_URL
    from ..utils import _ghl_headers
    import requests
    
    if not GHL_LOCATION_ID:
        logger.warning("search_contact_by_email: GHL_LOCATION_ID not set")
        return None
    
    email_trimmed = email.strip().lower()
    if not email_trimmed:
        logger.warning("search_contact_by_email: empty email after normalization")
        return None
    
    # Build request body with locationId in body and filters array
    body = {
        "locationId": GHL_LOCATION_ID.strip(),
        "page": 1,
        "pageLimit": 20,
        "filters": [
            {"field": "email", "operator": "eq", "value": email_trimmed}
        ],
    }
    
    try:
        resp = requests.post(
            CONTACTS_SEARCH_URL, headers=_ghl_headers(), json=body, timeout=10
        )
    except Exception as e:
        logger.error("search_contact_by_email: exception: %s", e)
        return None
    
    if not resp.ok:
        logger.debug("search_contact_by_email: search failed (%s): %s", resp.status_code, resp.text)
        return None
    
    try:
        data = resp.json()
    except Exception:
        logger.error("search_contact_by_email: failed to parse JSON response")
        return None
    
    # Extract contacts from response
    contacts = data.get("contacts", [])
    if not contacts and isinstance(data, list):
        contacts = data
    
    if contacts:
        logger.info("search_contact_by_email: found %d contacts using email=%s", len(contacts), email_trimmed)
        return contacts[0]
    
    logger.debug("search_contact_by_email: no contacts found for email=%s", email_trimmed)
    return None


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """
    Stripe webhook endpoint for SetupIntent events.
    
    Handles:
    - setup_intent.succeeded: Tag contact with "card_on_file:collected"
    - setup_intent.setup_failed: Log only
    - Other events: Ignore (return 200)
    
    Args:
        request: FastAPI request object
        stripe_signature: Stripe signature header for webhook verification
    
    Returns:
        JSONResponse with status 200 for all events (Stripe requires 200)
    """
    if not stripe_signature:
        logger.error("stripe_webhook: missing Stripe-Signature header")
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")
    
    # Get raw body for signature verification
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
        
        # Try to find contact by ghl_contact_id first
        if ghl_contact_id:
            contact_id_to_tag = ghl_contact_id
            logger.info(
                "stripe_webhook: using ghl_contact_id from metadata: %s",
                contact_id_to_tag
            )
        else:
            # Fallback: search by phone or email
            if phone:
                phone_normalized = normalize_phone(phone)
                if phone_normalized:
                    contact = search_contact_by_phone(phone_normalized)
                    if contact:
                        contact_id_to_tag = contact.get("id")
                        logger.info(
                            "stripe_webhook: found contact by phone: contact_id=%s phone=%s",
                            contact_id_to_tag,
                            phone_normalized[:4] + "***"
                        )
            
            if not contact_id_to_tag and email:
                contact = search_contact_by_email(email)
                if contact:
                    contact_id_to_tag = contact.get("id")
                    logger.info(
                        "stripe_webhook: found contact by email: contact_id=%s email=%s",
                        contact_id_to_tag,
                        email[:10] + "***"
                    )
        
        # Tag the contact if found
        if contact_id_to_tag:
            tag = "card_on_file:collected"
            success = add_tag_to_contact(contact_id_to_tag, tag)
            if success:
                logger.info(
                    "stripe_webhook: tagged contact_id=%s with tag=%s event_id=%s",
                    contact_id_to_tag,
                    tag,
                    event_id
                )
            else:
                logger.error(
                    "stripe_webhook: failed to tag contact_id=%s with tag=%s event_id=%s",
                    contact_id_to_tag,
                    tag,
                    event_id
                )
        else:
            logger.warning(
                "stripe_webhook: could not find contact for setup_intent_id=%s metadata=%s event_id=%s",
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

