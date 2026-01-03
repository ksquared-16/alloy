"""
Stripe webhook endpoints for SetupIntent events (card on file collection).
"""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Header, HTTPException
from fastapi.responses import JSONResponse
import stripe

from ..settings import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CUSTOM_FIELD_IDS
from ..utils import normalize_phone
from ..ghl_client import (
    search_contact_by_phone,
    search_contact_by_email,
    add_tag_to_contact,
    get_contact_by_id,
    update_contact_custom_field,
)

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


def _extract_stripe_customer_id_from_contact(contact: Dict[str, Any]) -> Optional[str]:
    """
    Extract Stripe Customer ID from GHL contact custom fields.
    
    Args:
        contact: GHL contact dict
    
    Returns:
        Stripe Customer ID (cus_...) if found, None otherwise
    """
    stripe_cf_id = CUSTOM_FIELD_IDS.get("stripe_customer_id")
    if not stripe_cf_id:
        return None
    
    custom_fields = contact.get("customFields", [])
    if isinstance(custom_fields, list):
        for cf in custom_fields:
            if isinstance(cf, dict) and str(cf.get("id", "")) == stripe_cf_id:
                value = cf.get("value", "")
                if value and isinstance(value, str) and value.startswith("cus_"):
                    return value
    elif isinstance(custom_fields, dict):
        value = custom_fields.get(stripe_cf_id, "")
        if value and isinstance(value, str) and value.startswith("cus_"):
            return value
    
    return None


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
    
    # Resolve GHL contact
    contact = None
    resolved_ghl_contact_id = None
    
    if ghl_contact_id:
        contact = get_contact_by_id(ghl_contact_id)
        if contact:
            resolved_ghl_contact_id = ghl_contact_id
            logger.info("create_setup_intent: validated ghl_contact_id=%s", ghl_contact_id)
        else:
            logger.warning("create_setup_intent: ghl_contact_id=%s invalid, falling back to search", ghl_contact_id)
    
    # Fallback: search by phone or email
    if not contact:
        phone_normalized = normalize_phone(phone)
        if phone_normalized:
            contact = search_contact_by_phone(phone_normalized)
            if contact:
                resolved_ghl_contact_id = contact.get("id")
                logger.info("create_setup_intent: found contact by phone: contact_id=%s", resolved_ghl_contact_id)
        
        if not contact:
            contact = search_contact_by_email(email)
            if contact:
                resolved_ghl_contact_id = contact.get("id")
                logger.info("create_setup_intent: found contact by email: contact_id=%s", resolved_ghl_contact_id)
    
    if not contact:
        logger.warning("create_setup_intent: could not resolve GHL contact for phone=%s email=%s", phone[:4] + "***", email[:10] + "***")
        # Continue anyway - we'll create SetupIntent without customer
    
    # Get or create Stripe Customer
    stripe_customer_id = None
    if contact:
        # Try to get existing Stripe Customer ID from GHL
        stripe_customer_id = _extract_stripe_customer_id_from_contact(contact)
        if stripe_customer_id:
            logger.info("create_setup_intent: found existing Stripe Customer ID=%s in GHL", stripe_customer_id[:8] + "***")
        else:
            # Create new Stripe Customer
            try:
                # Get name from contact if available
                first_name = contact.get("firstName", "")
                last_name = contact.get("lastName", "")
                name = None
                if first_name or last_name:
                    name = f"{first_name} {last_name}".strip()
                
                customer = stripe.Customer.create(
                    email=email,
                    phone=phone,
                    name=name,
                    metadata={
                        "ghl_contact_id": resolved_ghl_contact_id or "",
                    }
                )
                stripe_customer_id = customer.id
                logger.info("create_setup_intent: created Stripe Customer ID=%s", stripe_customer_id[:8] + "***")
                
                # Sync to GHL contact custom field
                if resolved_ghl_contact_id:
                    stripe_cf_id = CUSTOM_FIELD_IDS.get("stripe_customer_id")
                    if stripe_cf_id:
                        success = update_contact_custom_field(
                            resolved_ghl_contact_id,
                            "stripe_customer_id",
                            stripe_customer_id
                        )
                        if success:
                            logger.info("create_setup_intent: synced Stripe Customer ID to GHL contact_id=%s", resolved_ghl_contact_id)
                        else:
                            logger.warning("create_setup_intent: failed to sync Stripe Customer ID to GHL contact_id=%s", resolved_ghl_contact_id)
                    else:
                        logger.warning("create_setup_intent: GHL_STRIPE_CUSTOMER_ID not configured, skipping sync")
            except stripe.error.StripeError as e:
                logger.error("create_setup_intent: failed to create Stripe Customer: %s", e)
                # Continue without customer - SetupIntent can still be created
    
    # Build metadata for webhook matching
    metadata = {
        "phone": phone,
        "email": email,
    }
    if resolved_ghl_contact_id:
        metadata["ghl_contact_id"] = resolved_ghl_contact_id
    
    try:
        # Create SetupIntent (not PaymentIntent - no charge)
        setup_intent_params = {
            "usage": "off_session",  # For future charges
            "metadata": metadata,
        }
        
        # Add customer if we have one
        if stripe_customer_id:
            setup_intent_params["customer"] = stripe_customer_id
        
        setup_intent = stripe.SetupIntent.create(**setup_intent_params)
        
        logger.info(
            "create_setup_intent: created setup_intent_id=%s phone=%s email=%s ghl_contact_id=%s customer_id=%s",
            setup_intent.id,
            phone[:4] + "***" if len(phone) > 4 else "***",
            email[:10] + "***" if len(email) > 10 else "***",
            resolved_ghl_contact_id or "None",
            stripe_customer_id[:8] + "***" if stripe_customer_id else "None"
        )
        
        response_data = {"client_secret": setup_intent.client_secret}
        if stripe_customer_id:
            response_data["customer_id"] = stripe_customer_id
        
        return JSONResponse(response_data, status_code=200)
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
        setup_intent_obj = event.get("data", {}).get("object", {})
        setup_intent_id = setup_intent_obj.get("id")
        metadata = setup_intent_obj.get("metadata", {})
        
        ghl_contact_id = metadata.get("ghl_contact_id")
        phone = metadata.get("phone")
        email = metadata.get("email")
        
        # Retrieve full SetupIntent to get customer and payment_method (may not be in webhook payload)
        stripe_customer_id = setup_intent_obj.get("customer")
        payment_method_id = setup_intent_obj.get("payment_method")
        
        # If customer/payment_method not in webhook payload, retrieve full SetupIntent
        if setup_intent_id and (not stripe_customer_id or not payment_method_id):
            try:
                full_setup_intent = stripe.SetupIntent.retrieve(setup_intent_id)
                if not stripe_customer_id:
                    stripe_customer_id = full_setup_intent.customer
                if not payment_method_id:
                    payment_method_id = full_setup_intent.payment_method
            except stripe.error.StripeError as e:
                logger.warning("stripe_webhook: failed to retrieve full SetupIntent: %s", e)
                # Continue with what we have
        
        logger.info(
            "stripe_webhook: setup_intent.succeeded setup_intent_id=%s metadata=%s customer=%s payment_method=%s",
            setup_intent_id,
            metadata,
            stripe_customer_id[:8] + "***" if stripe_customer_id else "None",
            payment_method_id[:8] + "***" if payment_method_id else "None"
        )
        
        contact_id_to_tag = None
        resolution_path = None
        contact = None
        
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
        if not contact:
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
            
            if not contact and email:
                contact = search_contact_by_email(email)
                if contact:
                    contact_id_to_tag = contact.get("id")
                    resolution_path = "email_search"
                    logger.info(
                        "stripe_webhook: found contact by email: contact_id=%s email=%s (path: email_search)",
                        contact_id_to_tag,
                        email[:10] + "***"
                    )
        
        # Process contact updates (idempotent - safe to run multiple times)
        if contact_id_to_tag:
            # 1. Tag contact with "card_on_file:collected" (idempotent - tag won't be added twice)
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
            
            # 2. Sync Stripe Customer ID to GHL (idempotent - will update if different, no-op if same)
            if stripe_customer_id and stripe_customer_id.startswith("cus_"):
                # Check if contact already has this customer ID
                existing_customer_id = _extract_stripe_customer_id_from_contact(contact)
                if existing_customer_id != stripe_customer_id:
                    stripe_cf_id = CUSTOM_FIELD_IDS.get("stripe_customer_id")
                    if stripe_cf_id:
                        sync_success = update_contact_custom_field(
                            contact_id_to_tag,
                            "stripe_customer_id",
                            stripe_customer_id
                        )
                        if sync_success:
                            logger.info(
                                "stripe_webhook: synced Stripe Customer ID=%s to GHL contact_id=%s event_id=%s",
                                stripe_customer_id[:8] + "***",
                                contact_id_to_tag,
                                event_id
                            )
                        else:
                            logger.warning(
                                "stripe_webhook: failed to sync Stripe Customer ID to GHL contact_id=%s event_id=%s",
                                contact_id_to_tag,
                                event_id
                            )
                    else:
                        logger.warning("stripe_webhook: GHL_STRIPE_CUSTOMER_ID not configured, skipping sync")
                else:
                    logger.debug(
                        "stripe_webhook: Stripe Customer ID already synced for contact_id=%s event_id=%s",
                        contact_id_to_tag,
                        event_id
                    )
            
            # 3. Attach payment method to customer and set as default (idempotent)
            if stripe_customer_id and payment_method_id:
                try:
                    # Retrieve payment method to check if already attached
                    pm = stripe.PaymentMethod.retrieve(payment_method_id)
                    if pm.customer != stripe_customer_id:
                        # Attach payment method to customer
                        stripe.PaymentMethod.attach(payment_method_id, customer=stripe_customer_id)
                        logger.info(
                            "stripe_webhook: attached payment_method=%s to customer=%s event_id=%s",
                            payment_method_id[:8] + "***",
                            stripe_customer_id[:8] + "***",
                            event_id
                        )
                    
                    # Set as default payment method (idempotent - safe to call multiple times)
                    stripe.Customer.modify(
                        stripe_customer_id,
                        invoice_settings={"default_payment_method": payment_method_id}
                    )
                    logger.info(
                        "stripe_webhook: set payment_method=%s as default for customer=%s event_id=%s",
                        payment_method_id[:8] + "***",
                        stripe_customer_id[:8] + "***",
                        event_id
                    )
                except stripe.error.StripeError as e:
                    logger.warning(
                        "stripe_webhook: failed to attach/set default payment method: %s event_id=%s",
                        e,
                        event_id
                    )
                    # Non-fatal - continue
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

