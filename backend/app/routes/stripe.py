"""
Stripe webhook endpoints for SetupIntent events (card on file collection).
"""
import logging
import hashlib
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Header, HTTPException, Query
from fastapi.responses import JSONResponse
import stripe

from ..settings import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CUSTOM_FIELD_IDS, GHL_WORKFLOW_SECRET, GHL_STAGE_ID_PAYMENT_SUCCEEDED
from ..utils import normalize_phone
from ..ghl_client import (
    search_contact_by_phone,
    search_contact_by_email,
    add_tag_to_contact,
    get_contact_by_id,
    get_opportunity_by_id,
    update_contact_custom_field,
    create_contact_note,
    update_opportunity_stage,
)
from ..supabase_client import link_stripe_customer_to_supabase

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

# Log Stripe mode at startup (without exposing secrets)
stripe_mode = "live" if STRIPE_SECRET_KEY.startswith("sk_live_") else "test" if STRIPE_SECRET_KEY.startswith("sk_test_") else "unknown"
logger.info("STRIPE_MODE=%s (key prefix: %s)", stripe_mode, STRIPE_SECRET_KEY[:7] + "***" if STRIPE_SECRET_KEY else "None")

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


def record_payment_failure(ghl_contact_id: Optional[str], title: str, body: str) -> None:
    """
    Helper to record payment failure in GHL: add tag and create note.
    Safe/no-op if ghl_contact_id is missing.
    """
    if not ghl_contact_id:
        return
    
    add_tag_to_contact(ghl_contact_id, "payment:failed")
    create_contact_note(ghl_contact_id, title, body)


@router.get("/stripe/card-status")
async def get_card_status(
    ghl_contact_id: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
):
    """
    Check if a contact has a card on file.
    
    Query params (at least one required):
        - ghl_contact_id: Preferred - GHL contact ID
        - phone: Fallback if ghl_contact_id not provided
        - email: Fallback if ghl_contact_id not provided
    
    Returns:
        {
            "has_card_on_file": boolean,
            "customer_id": string | null,
            "default_payment_method_id": string | null,
            "brand": string | null,
            "last4": string | null
        }
    """
    # Resolve contact using canonical resolution (email-first, then phone)
    contact = None
    resolved_ghl_contact_id = None
    resolution_path = None
    
    if ghl_contact_id:
        contact = get_contact_by_id(ghl_contact_id)
        if contact:
            resolved_ghl_contact_id = ghl_contact_id
            resolution_path = "ghl_contact_id"
            logger.info("get_card_status: validated ghl_contact_id=%s", ghl_contact_id)
        else:
            logger.warning("get_card_status: ghl_contact_id=%s invalid, falling back to search", ghl_contact_id)
    
    # Fallback: search by email first (canonical resolution)
    if not contact and email:
        email_normalized = email.strip().lower()
        contact = search_contact_by_email(email_normalized)
        if contact:
            resolved_ghl_contact_id = contact.get("id")
            resolution_path = "email_search"
            logger.info("get_card_status: found contact by email: contact_id=%s", resolved_ghl_contact_id)
    
    # Fallback: search by phone
    if not contact and phone:
        phone_normalized = normalize_phone(phone)
        if phone_normalized:
            contact = search_contact_by_phone(phone_normalized)
            if contact:
                resolved_ghl_contact_id = contact.get("id")
                resolution_path = "phone_search"
                logger.info("get_card_status: found contact by phone: contact_id=%s", resolved_ghl_contact_id)
    
    if not contact:
        logger.info(
            "get_card_status: no contact found ghl_contact_id=%s phone=%s email=%s",
            ghl_contact_id or "None",
            phone[:4] + "***" if phone else "None",
            email[:10] + "***" if email else "None"
        )
        return JSONResponse({
            "has_card_on_file": False,
            "customer_id": None,
            "default_payment_method_id": None,
            "brand": None,
            "last4": None,
        })
    
    # Extract Stripe Customer ID from GHL contact
    stripe_customer_id = _extract_stripe_customer_id_from_contact(contact)
    
    if not stripe_customer_id:
        logger.info(
            "get_card_status: no stripe_customer_id found contact_id=%s resolution_path=%s",
            resolved_ghl_contact_id,
            resolution_path
        )
        return JSONResponse({
            "has_card_on_file": False,
            "customer_id": None,
            "default_payment_method_id": None,
            "brand": None,
            "last4": None,
        })
    
    # Retrieve Stripe customer and check for default payment method
    try:
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_payment_method_id = customer.invoice_settings.default_payment_method
        
        if not default_payment_method_id:
            # Check if customer has any payment methods attached
            payment_methods = stripe.PaymentMethod.list(
                customer=stripe_customer_id,
                type="card",
                limit=1
            )
            if payment_methods.data:
                default_payment_method_id = payment_methods.data[0].id
                logger.info(
                    "get_card_status: no default payment method, using first available payment_method_id=%s",
                    default_payment_method_id[:8] + "***"
                )
        
        if default_payment_method_id:
            # Retrieve payment method to get brand and last4
            payment_method = stripe.PaymentMethod.retrieve(default_payment_method_id)
            card = payment_method.card
            brand = card.brand if card else None
            last4 = card.last4 if card else None
            
            logger.info(
                "get_card_status: card on file found contact_id=%s customer_id=%s payment_method_id=%s brand=%s last4=%s resolution_path=%s",
                resolved_ghl_contact_id,
                stripe_customer_id[:8] + "***",
                default_payment_method_id[:8] + "***",
                brand,
                last4,
                resolution_path
            )
            
            return JSONResponse({
                "has_card_on_file": True,
                "customer_id": stripe_customer_id,
                "default_payment_method_id": default_payment_method_id,
                "brand": brand,
                "last4": last4,
            })
        else:
            logger.info(
                "get_card_status: customer exists but no payment method contact_id=%s customer_id=%s resolution_path=%s",
                resolved_ghl_contact_id,
                stripe_customer_id[:8] + "***",
                resolution_path
            )
            return JSONResponse({
                "has_card_on_file": False,
                "customer_id": stripe_customer_id,
                "default_payment_method_id": None,
                "brand": None,
                "last4": None,
            })
    except stripe.error.StripeError as e:
        logger.error(
            "get_card_status: Stripe error retrieving customer_id=%s: %s",
            stripe_customer_id[:8] + "***" if stripe_customer_id else "None",
            e
        )
        return JSONResponse({
            "has_card_on_file": False,
            "customer_id": stripe_customer_id,
            "default_payment_method_id": None,
            "brand": None,
            "last4": None,
        })
    except Exception as e:
        logger.error(
            "get_card_status: unexpected error: %s",
            e,
            exc_info=True
        )
        return JSONResponse({
            "has_card_on_file": False,
            "customer_id": None,
            "default_payment_method_id": None,
            "brand": None,
            "last4": None,
        })


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
        
        # Link Stripe customer to Supabase (non-blocking)
        if stripe_customer_id:
            try:
                link_stripe_customer_to_supabase(
                    stripe_customer_id,
                    ghl_contact_id=resolved_ghl_contact_id,
                    email=email,
                    phone=phone,
                    setup_intent_id=setup_intent.id,
                )
            except Exception as e:
                logger.warning(
                    "create_setup_intent: Failed to link Stripe customer to Supabase (non-blocking): %s",
                    str(e)
                )
                # Continue - payment setup succeeds even if Supabase link fails
        
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
        logger.info(
            "stripe_webhook: handling setup_intent.succeeded event_id=%s setup_intent_id=%s",
            event_id,
            setup_intent_id
        )
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
            # Initialize payment method details (will be populated if available)
            payment_method_brand = None
            payment_method_last4 = None
            billing_address = None
            
            if stripe_customer_id and payment_method_id:
                try:
                    # Retrieve payment method to check if already attached and get details
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
                    
                    # Extract payment method details
                    if hasattr(pm, 'card') and pm.card:
                        payment_method_brand = getattr(pm.card, 'brand', None)
                        payment_method_last4 = getattr(pm.card, 'last4', None)
                    
                    # Extract billing address if available
                    if hasattr(pm, 'billing_details') and pm.billing_details:
                        billing_details = pm.billing_details
                        if hasattr(billing_details, 'address') and billing_details.address:
                            addr = billing_details.address
                            billing_address = {
                                "line1": getattr(addr, 'line1', None),
                                "line2": getattr(addr, 'line2', None),
                                "city": getattr(addr, 'city', None),
                                "state": getattr(addr, 'state', None),
                                "postal_code": getattr(addr, 'postal_code', None),
                                "country": getattr(addr, 'country', None),
                            }
                            # Remove None values
                            billing_address = {k: v for k, v in billing_address.items() if v is not None}
                            if not billing_address:
                                billing_address = None
                except stripe.error.StripeError as e:
                    logger.warning(
                        "stripe_webhook: failed to attach/set default payment method: %s event_id=%s",
                        e,
                        event_id
                    )
                    # Non-fatal - continue
            
            # 4. Link Stripe customer to Supabase (non-blocking)
            if stripe_customer_id:
                try:
                    link_stripe_customer_to_supabase(
                        stripe_customer_id,
                        ghl_contact_id=ghl_contact_id,
                        email=email,
                        phone=phone,
                        setup_intent_id=setup_intent_id,
                        payment_method_id=payment_method_id,
                        payment_method_brand=payment_method_brand,
                        payment_method_last4=payment_method_last4,
                        billing_address=billing_address,
                    )
                except Exception as e:
                    logger.warning(
                        "stripe_webhook: Failed to link Stripe customer to Supabase (non-blocking): %s event_id=%s",
                        str(e),
                        event_id
                    )
                    # Continue - webhook succeeds even if Supabase link fails
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
        last_setup_error = setup_intent.get("last_setup_error", {})
        error_code = last_setup_error.get("code")
        error_decline_code = last_setup_error.get("decline_code")
        error_type = last_setup_error.get("type")
        error_message = last_setup_error.get("message", "Unknown")
        payment_method_id = setup_intent.get("payment_method")
        
        logger.warning(
            "stripe_webhook: setup_intent.setup_failed event_id=%s setup_intent_id=%s error_code=%s error_decline_code=%s error_type=%s error_message=%s payment_method_id=%s",
            event_id,
            setup_intent_id,
            error_code,
            error_decline_code,
            error_type,
            error_message,
            payment_method_id[:8] + "***" if payment_method_id else "None"
        )
    
    # Ignore other event types
    else:
        logger.debug("stripe_webhook: ignoring event type=%s event_id=%s", event_type, event_id)
    
    # Always return 200 (Stripe requires 200 for all events)
    return JSONResponse({"received": True}, status_code=200)


@router.post("/stripe/charge")
async def charge_customer(
    request: Request,
    x_alloy_workflow_secret: Optional[str] = Header(None, alias="X-ALLOY-WORKFLOW-SECRET"),
):
    """
    Charge a customer's saved payment method (off-session).
    
    Called by GHL workflow when opportunity stage becomes "Ready to Pay".
    
    Security: Requires X-ALLOY-WORKFLOW-SECRET header matching GHL_WORKFLOW_SECRET.
    
    Accepts JSON or form-urlencoded body with:
        - stripe_customer_id (optional): Stripe Customer ID (can be provided as "stripe_customer_id", "Stripe Customer ID", or "stripeCustomerId")
        - amount (required): Amount in dollars (e.g., "240" or "240.00")
        - currency (optional, default "usd")
        - description (optional)
        - opportunity_id (optional)
        - ghl_contact_id (optional): If stripe_customer_id is missing, will attempt to extract from GHL contact
    
    Returns:
        {
            "status": "succeeded" | "failed",
            "payment_intent_id": string | null,
            "amount_cents": integer,
            "opportunity_id": string | null,
            "error": string | null,
            "attempted_charge": boolean
        }
    """
    # Security check
    if not x_alloy_workflow_secret or x_alloy_workflow_secret != GHL_WORKFLOW_SECRET:
        logger.error("charge_customer: invalid or missing X-ALLOY-WORKFLOW-SECRET header")
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid workflow secret")
    
    # Parse request body (support both JSON and form-urlencoded)
    body = {}
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            body = await request.json()
        else:
            # Try form-urlencoded
            form_data = await request.form()
            body = dict(form_data)
    except Exception as e:
        logger.error("charge_customer: failed to parse request body: %s", e)
        error_msg = "Invalid request body"
        body_keys = list(body.keys()) if isinstance(body, dict) else []
        
        note_body = f"Payment failed: {error_msg}\nReceived payload keys: {body_keys}"
        record_payment_failure(None, "Payment Failed - Preflight", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": 0,
            "opportunity_id": None,
            "error": error_msg,
            "attempted_charge": False
        }, status_code=200)
    
    # CHARGE_PAYLOAD_DEBUG: Temporary debug logging for request body inspection
    body_keys = list(body.keys()) if isinstance(body, dict) else []
    custom_data = body.get("customData")
    custom_data_keys = list(custom_data.keys()) if isinstance(custom_data, dict) else None
    opportunity_obj = body.get("opportunity")
    opportunity_keys = list(opportunity_obj.keys()) if isinstance(opportunity_obj, dict) else None
    
    # Mask PII in values before logging
    def mask_pii(value):
        if not value or not isinstance(value, str):
            return value
        # Simple masking: if contains @ or looks like phone, mask it
        if "@" in value:
            parts = value.split("@")
            if len(parts) == 2:
                return f"{parts[0][:2]}***@{parts[1]}"
        # If looks like phone number (has digits and + or -), mask
        if any(c.isdigit() for c in value) and ("+" in value or "-" in value or "(" in value):
            return value[:4] + "***" + value[-4:] if len(value) > 8 else "***"
        return value
    
    opportunity_id_raw = body.get("opportunity_id")
    amount_raw = body.get("amount")
    custom_data_opportunity_id = body.get("customData", {}).get("opportunity_id") if isinstance(body.get("customData"), dict) else None
    custom_data_amount = body.get("customData", {}).get("amount") if isinstance(body.get("customData"), dict) else None
    
    logger.info(
        "CHARGE_PAYLOAD_DEBUG: content_type=%s body_keys=%s customData_keys=%s opportunity_present=%s opportunity_keys=%s "
        "opportunity_id=%s amount=%s customData.opportunity_id=%s customData.amount=%s",
        content_type,
        body_keys,
        custom_data_keys,
        opportunity_obj is not None,
        opportunity_keys,
        mask_pii(str(opportunity_id_raw)) if opportunity_id_raw is not None else None,
        mask_pii(str(amount_raw)) if amount_raw is not None else None,
        mask_pii(str(custom_data_opportunity_id)) if custom_data_opportunity_id is not None else None,
        mask_pii(str(custom_data_amount)) if custom_data_amount is not None else None
    )
    
    # Support multiple key names for stripe_customer_id
    stripe_customer_id = (
        body.get("stripe_customer_id") or
        body.get("Stripe Customer ID") or
        body.get("stripeCustomerId")
    )
    amount_str = body.get("amount")
    currency = body.get("currency", "usd")
    description = body.get("description")
    ghl_contact_id = body.get("ghl_contact_id")
    
    # Resolve opportunity_id robustly from multiple possible keys and nested structures
    opportunity_id = (
        body.get("opportunity_id") or
        body.get("opportunityId") or
        None
    )
    
    # Fallback to body["id"] only if opportunity_id not found
    if not opportunity_id:
        opportunity_id = body.get("id")
    
    # Check nested structures
    if not opportunity_id:
        opp_obj = body.get("opportunity")
        if isinstance(opp_obj, dict):
            opportunity_id = (
                opp_obj.get("id") or
                opp_obj.get("opportunity_id") or
                opp_obj.get("opportunityId")
            )
            # Check double-nested
            if not opportunity_id:
                nested_opp = opp_obj.get("opportunity")
                if isinstance(nested_opp, dict):
                    opportunity_id = (
                        nested_opp.get("id") or
                        nested_opp.get("opportunity_id") or
                        nested_opp.get("opportunityId")
                    )
    
    # Normalize amount_str: treat None, empty string, or whitespace as missing
    amount_is_blank = not amount_str or (isinstance(amount_str, str) and not amount_str.strip())
    
    # Normalize description: treat None, empty string, or whitespace as missing
    description_is_blank = not description or (isinstance(description, str) and not description.strip())
    
    # Determine initial fallback path
    initial_fallback_path = "direct"
    if not stripe_customer_id and ghl_contact_id:
        initial_fallback_path = "will_attempt_ghl_contact_fallback"
    if amount_is_blank and opportunity_id:
        if initial_fallback_path == "direct":
            initial_fallback_path = "will_attempt_opportunity_fallback"
        else:
            initial_fallback_path = "will_attempt_both_fallbacks"
    
    # Log initial state
    body_keys = list(body.keys()) if isinstance(body, dict) else []
    logger.info(
        "charge_customer: received keys=%s opportunity_id=%s amount_blank=%s description_blank=%s fallback_path=%s",
        body_keys,
        opportunity_id or "None",
        amount_is_blank,
        description_is_blank,
        initial_fallback_path
    )
    
    # If stripe_customer_id is missing and ghl_contact_id is provided, try to extract from GHL contact
    resolution_path = "direct"
    if not stripe_customer_id and ghl_contact_id:
        logger.info("charge_customer: stripe_customer_id missing, attempting to extract from GHL contact_id=%s", ghl_contact_id)
        contact = get_contact_by_id(ghl_contact_id)
        if contact:
            stripe_customer_id = _extract_stripe_customer_id_from_contact(contact)
            if stripe_customer_id:
                resolution_path = "ghl_contact_fallback"
                logger.info("charge_customer: extracted stripe_customer_id=%s from GHL contact_id=%s", stripe_customer_id[:8] + "***", ghl_contact_id)
            else:
                logger.warning("charge_customer: GHL contact_id=%s found but no Stripe Customer ID in custom fields", ghl_contact_id)
        else:
            logger.warning("charge_customer: GHL contact_id=%s not found", ghl_contact_id)
    
    # If amount is missing and opportunity_id is provided, try to extract from GHL opportunity
    amount_resolution_path = "direct"
    amount_source_key = None
    wrapper_detected = False
    if amount_is_blank:
        if opportunity_id:
            logger.info("charge_customer: amount missing/blank, attempting to extract from GHL opportunity_id=%s", opportunity_id)
            opportunity_resp = get_opportunity_by_id(opportunity_id)
            if opportunity_resp:
                # Normalize shape: handle both wrapped { "opportunity": {...} } and unwrapped {...}
                if isinstance(opportunity_resp, dict) and "opportunity" in opportunity_resp:
                    opportunity = opportunity_resp["opportunity"]
                    wrapper_detected = True
                else:
                    opportunity = opportunity_resp
                    wrapper_detected = False
                
                logger.info("charge_customer: opportunity fetched opportunity_id=%s wrapper_detected=%s", opportunity_id, wrapper_detected)
                
                # Extract amount with priority order
                amount_str = (
                    opportunity.get("monetaryValue") or
                    opportunity.get("monetary_value") or
                    opportunity.get("leadValue") or
                    opportunity.get("lead_value")
                )
                
                if amount_str:
                    # Determine which key was used
                    if opportunity.get("monetaryValue"):
                        amount_source_key = "monetaryValue"
                    elif opportunity.get("monetary_value"):
                        amount_source_key = "monetary_value"
                    elif opportunity.get("leadValue"):
                        amount_source_key = "leadValue"
                    elif opportunity.get("lead_value"):
                        amount_source_key = "lead_value"
                else:
                    # OPTIONAL: scan customFields for first numeric fieldValue
                    custom_fields = opportunity.get("customFields", [])
                    if isinstance(custom_fields, list):
                        for cf in custom_fields:
                            if isinstance(cf, dict):
                                field_value = cf.get("value") or cf.get("fieldValue")
                                if field_value:
                                    try:
                                        # Try to parse as numeric
                                        float_val = float(str(field_value))
                                        if float_val > 0:
                                            amount_str = str(field_value)
                                            amount_source_key = f"customFields[{cf.get('name', 'unknown')}]"
                                            logger.info("charge_customer: extracted amount from customField: %s", amount_source_key)
                                            break
                                    except (ValueError, TypeError):
                                        continue
                
                if amount_str:
                    amount_resolution_path = f"ghl_opportunity_fallback:{amount_source_key}"
                    amount_is_blank = False  # Update flag since we successfully extracted amount
                    logger.info("charge_customer: extracted amount=%s from GHL opportunity_id=%s source_key=%s wrapper_detected=%s", amount_str, opportunity_id, amount_source_key, wrapper_detected)
                else:
                    logger.warning("charge_customer: GHL opportunity_id=%s found but no amount field could be extracted wrapper_detected=%s", opportunity_id, wrapper_detected)
                
                # Extract description from opportunity name if missing/blank
                if description_is_blank:
                    opportunity_name = opportunity.get("name") or opportunity.get("title")
                    if opportunity_name:
                        description = opportunity_name
                        description_is_blank = False
                        logger.info("charge_customer: extracted description=%s from GHL opportunity", description[:50] + "..." if len(description) > 50 else description)
            else:
                logger.warning("charge_customer: GHL opportunity_id=%s not found", opportunity_id)
    
    # Validate required fields (record failure and return 200 if still missing after GHL fallbacks)
    if not stripe_customer_id:
        logger.error("charge_customer: missing stripe_customer_id (resolution_path=%s)", resolution_path)
        error_msg = "stripe_customer_id is required and could not be extracted from GHL contact"
        body_keys = list(body.keys()) if isinstance(body, dict) else []
        note_body = f"Payment failed: {error_msg}\nResolution path: {resolution_path}"
        if opportunity_id:
            note_body += f"\nOpportunity ID: {opportunity_id}"
        if ghl_contact_id:
            note_body += f"\nGHL Contact ID: {ghl_contact_id}"
        if description:
            note_body += f"\nDescription: {description}"
        note_body += f"\nReceived payload keys: {body_keys}"
        record_payment_failure(ghl_contact_id, "Payment Failed - Preflight", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": 0,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": False
        }, status_code=200)
    
    if amount_is_blank:
        logger.error("charge_customer: missing amount (amount_resolution_path=%s)", amount_resolution_path)
        error_msg = "amount is required (and could not be derived from opportunity)"
        note_body = f"Payment failed: {error_msg}\nThis is a SYSTEM/CONFIG failure (not a card failure) - the opportunity may be missing amount fields.\nAmount resolution path: {amount_resolution_path}"
        if opportunity_id:
            note_body += f"\nResolved Opportunity ID: {opportunity_id}"
        if ghl_contact_id:
            note_body += f"\nGHL Contact ID: {ghl_contact_id}"
        if stripe_customer_id:
            note_body += f"\nStripe Customer ID: {stripe_customer_id[:8] + '***'}"
        if description:
            note_body += f"\nDescription: {description}"
        note_body += f"\nReceived payload keys: {body_keys}"
        record_payment_failure(ghl_contact_id, "Payment Failed - Preflight", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": 0,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": False
        }, status_code=200)
    
    # Log input (mask sensitive)
    logger.info(
        "charge_customer: received request customer_id=%s amount=%s currency=%s description=%s opportunity_id=%s ghl_contact_id=%s resolution_path=%s amount_resolution_path=%s",
        stripe_customer_id[:8] + "***" if stripe_customer_id else "None",
        amount_str,
        currency,
        description[:50] + "..." if description and len(description) > 50 else (description or "None"),
        opportunity_id or "None",
        ghl_contact_id or "None",
        resolution_path,
        amount_resolution_path
    )
    
    # Convert amount to cents (safely handle dollars)
    try:
        amount_decimal = Decimal(str(amount_str))
        amount_cents = int(amount_decimal * 100)
        
        if amount_cents <= 0:
            logger.error("charge_customer: invalid amount (must be > 0): %s", amount_str)
            error_msg = "amount must be greater than 0"
            body_keys = list(body.keys()) if isinstance(body, dict) else []
            note_body = f"Payment failed: {error_msg}\nAmount provided: {amount_str}"
            if opportunity_id:
                note_body += f"\nOpportunity ID: {opportunity_id}"
            if ghl_contact_id:
                note_body += f"\nGHL Contact ID: {ghl_contact_id}"
            if stripe_customer_id:
                note_body += f"\nStripe Customer ID: {stripe_customer_id[:8] + '***'}"
            if description:
                note_body += f"\nDescription: {description}"
            note_body += f"\nReceived payload keys: {body_keys}"
            record_payment_failure(ghl_contact_id, "Payment Failed - Preflight", note_body)
            
            return JSONResponse({
                "status": "failed",
                "payment_intent_id": None,
                "amount_cents": 0,
                "opportunity_id": opportunity_id,
                "error": error_msg,
                "attempted_charge": False
            }, status_code=200)
        
        logger.info("charge_customer: converted amount %s dollars to %d cents", amount_str, amount_cents)
    except (InvalidOperation, ValueError, TypeError) as e:
        logger.error("charge_customer: failed to convert amount %s: %s", amount_str, e)
        error_msg = f"Invalid amount format: {amount_str}"
        body_keys = list(body.keys()) if isinstance(body, dict) else []
        note_body = f"Payment failed: {error_msg}"
        if opportunity_id:
            note_body += f"\nOpportunity ID: {opportunity_id}"
        if ghl_contact_id:
            note_body += f"\nGHL Contact ID: {ghl_contact_id}"
        if stripe_customer_id:
            note_body += f"\nStripe Customer ID: {stripe_customer_id[:8] + '***'}"
        if description:
            note_body += f"\nDescription: {description}"
        note_body += f"\nReceived payload keys: {body_keys}"
        record_payment_failure(ghl_contact_id, "Payment Failed - Preflight", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": 0,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": False
        }, status_code=200)
    
    # Retrieve Stripe customer and resolve payment method
    try:
        customer = stripe.Customer.retrieve(stripe_customer_id)
        logger.info("charge_customer: retrieved customer_id=%s", stripe_customer_id[:8] + "***")
    except stripe.error.StripeError as e:
        logger.error("charge_customer: failed to retrieve customer_id=%s: %s", stripe_customer_id[:8] + "***", e)
        error_msg = f"Failed to retrieve customer: {str(e)}"
        
        note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
        if opportunity_id:
            note_body += f"\nOpportunity ID: {opportunity_id}"
        if description:
            note_body += f"\nDescription: {description}"
        record_payment_failure(ghl_contact_id, "Payment Failed", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": amount_cents,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": True
        }, status_code=200)
    
    # Determine default payment method
    payment_method_id = customer.invoice_settings.default_payment_method
    
    if not payment_method_id:
        # Fallback: list payment methods and use the newest
        try:
            payment_methods = stripe.PaymentMethod.list(
                customer=stripe_customer_id,
                type="card",
                limit=1
            )
            if payment_methods.data:
                payment_method_id = payment_methods.data[0].id
                logger.info(
                    "charge_customer: no default payment method, using first available payment_method_id=%s",
                    payment_method_id[:8] + "***"
                )
            else:
                logger.error("charge_customer: no payment methods found for customer_id=%s", stripe_customer_id[:8] + "***")
                error_msg = "No payment method found for customer. Please add a payment method first."
                
                note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
                if opportunity_id:
                    note_body += f"\nOpportunity ID: {opportunity_id}"
                if description:
                    note_body += f"\nDescription: {description}"
                record_payment_failure(ghl_contact_id, "Payment Failed", note_body)
                
                return JSONResponse({
                    "status": "failed",
                    "payment_intent_id": None,
                    "amount_cents": amount_cents,
                    "opportunity_id": opportunity_id,
                    "error": error_msg,
                    "attempted_charge": True
                }, status_code=200)
        except stripe.error.StripeError as e:
            logger.error("charge_customer: failed to list payment methods: %s", e)
            error_msg = f"Failed to retrieve payment methods: {str(e)}"
            
            note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
            if opportunity_id:
                note_body += f"\nOpportunity ID: {opportunity_id}"
            if description:
                note_body += f"\nDescription: {description}"
            record_payment_failure(ghl_contact_id, "Payment Failed", note_body)
            
            return JSONResponse({
                "status": "failed",
                "payment_intent_id": None,
                "amount_cents": amount_cents,
                "opportunity_id": opportunity_id,
                "error": error_msg,
                "attempted_charge": True
            }, status_code=200)
    else:
        logger.info(
            "charge_customer: using default payment method payment_method_id=%s",
            payment_method_id[:8] + "***"
        )
    
    # Build idempotency key
    idempotency_parts = [
        "charge",
        stripe_customer_id,
        str(amount_cents),
        opportunity_id or description or "unknown"
    ]
    idempotency_key = ":".join(idempotency_parts)
    # Hash to keep it under Stripe's 255 char limit and make it URL-safe
    idempotency_key_hash = hashlib.sha256(idempotency_key.encode()).hexdigest()[:64]
    
    logger.info(
        "charge_customer: created idempotency_key_hash=%s from parts=%s",
        idempotency_key_hash,
        idempotency_parts
    )
    
    # Create and confirm PaymentIntent
    try:
        metadata = {}
        if opportunity_id:
            metadata["opportunity_id"] = opportunity_id
        if ghl_contact_id:
            metadata["ghl_contact_id"] = ghl_contact_id
        
        payment_intent = stripe.PaymentIntent.create(
            customer=stripe_customer_id,
            amount=amount_cents,
            currency=currency,
            description=description,
            payment_method=payment_method_id,
            confirm=True,
            off_session=True,
            metadata=metadata,
            idempotency_key=idempotency_key_hash
        )
        
        logger.info(
            "charge_customer: created payment_intent_id=%s status=%s customer_id=%s amount_cents=%d",
            payment_intent.id,
            payment_intent.status,
            stripe_customer_id[:8] + "***",
            amount_cents
        )
        
        # Update GHL based on result
        if payment_intent.status == "succeeded":
            # Success: tag contact and add note
            if ghl_contact_id:
                add_tag_to_contact(ghl_contact_id, "payment:succeeded")
                
                note_title = "Payment Succeeded"
                note_body = f"Amount: ${amount_decimal:.2f}\nPayment Intent: {payment_intent.id}\nStripe Customer ID: {stripe_customer_id}"
                if opportunity_id:
                    note_body += f"\nOpportunity ID: {opportunity_id}"
                if description:
                    note_body += f"\nDescription: {description}"
                create_contact_note(ghl_contact_id, note_title, note_body)
                
                logger.info(
                    "charge_customer: updated GHL contact_id=%s with payment:succeeded tag and note payment_intent_id=%s status=%s",
                    ghl_contact_id,
                    payment_intent.id,
                    payment_intent.status
                )
            
            # Move opportunity to "Payment Succeeded" stage if opportunity_id is present
            PAYMENT_SUCCEEDED_STAGE_ID = "86508b40-a1d7-4c38-948f-76bb7b8c7a4f"
            if opportunity_id:
                logger.info("charge_customer: attempting to update opportunity_id=%s to stage_id=%s", opportunity_id, PAYMENT_SUCCEEDED_STAGE_ID)
                stage_update_success = update_opportunity_stage(opportunity_id, PAYMENT_SUCCEEDED_STAGE_ID)
                if stage_update_success:
                    logger.info("charge_customer: successfully updated opportunity_id=%s to stage_id=%s", opportunity_id, PAYMENT_SUCCEEDED_STAGE_ID)
                else:
                    logger.error("charge_customer: failed to update opportunity_id=%s to stage_id=%s", opportunity_id, PAYMENT_SUCCEEDED_STAGE_ID)
                    # Tag contact with needs_attention and create note explaining the issue
                    if ghl_contact_id:
                        add_tag_to_contact(ghl_contact_id, "payment:needs_attention")
                        error_note_body = f"Payment succeeded in Stripe but failed to update opportunity stage.\nPayment Intent: {payment_intent.id}\nOpportunity ID: {opportunity_id}\nStage ID: {PAYMENT_SUCCEEDED_STAGE_ID}\nAmount: ${amount_decimal:.2f}"
                        create_contact_note(ghl_contact_id, "Payment Stage Update Failed", error_note_body)
            
            return JSONResponse({
                "status": "succeeded",
                "payment_intent_id": payment_intent.id,
                "amount_cents": amount_cents,
                "opportunity_id": opportunity_id,
                "error": None,
                "attempted_charge": True
            }, status_code=200)
        elif payment_intent.status == "requires_action":
            # SCA required - customer needs to authenticate
            error_msg = "Payment requires customer authentication (SCA). Customer needs to re-authenticate."
            logger.warning(
                "charge_customer: payment requires SCA payment_intent_id=%s customer_id=%s",
                payment_intent.id,
                stripe_customer_id[:8] + "***"
            )
            
            note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
            if opportunity_id:
                note_body += f"\nOpportunity ID: {opportunity_id}"
            if description:
                note_body += f"\nDescription: {description}"
            if payment_intent.id:
                note_body += f"\nPayment Intent: {payment_intent.id}"
            record_payment_failure(ghl_contact_id, "Payment Failed - Authentication Required", note_body)
            
            return JSONResponse({
                "status": "failed",
                "payment_intent_id": payment_intent.id,
                "amount_cents": amount_cents,
                "opportunity_id": opportunity_id,
                "error": error_msg,
                "attempted_charge": True
            }, status_code=200)
        else:
            # Other failure status
            error_msg = f"Payment failed with status: {payment_intent.status}"
            if payment_intent.last_payment_error:
                error_msg += f" - {payment_intent.last_payment_error.message}"
            
            logger.error(
                "charge_customer: payment failed payment_intent_id=%s status=%s customer_id=%s",
                payment_intent.id,
                payment_intent.status,
                stripe_customer_id[:8] + "***"
            )
            
            note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
            if opportunity_id:
                note_body += f"\nOpportunity ID: {opportunity_id}"
            if description:
                note_body += f"\nDescription: {description}"
            if payment_intent.id:
                note_body += f"\nPayment Intent: {payment_intent.id}"
            if payment_intent.last_payment_error:
                note_body += f"\nStripe Error Code: {payment_intent.last_payment_error.code}"
            record_payment_failure(ghl_contact_id, "Payment Failed", note_body)
            
            return JSONResponse({
                "status": "failed",
                "payment_intent_id": payment_intent.id,
                "amount_cents": amount_cents,
                "opportunity_id": opportunity_id,
                "error": error_msg,
                "attempted_charge": True
            }, status_code=200)
            
    except stripe.error.CardError as e:
        # Card was declined
        error_msg = f"Card declined: {e.user_message or str(e)}"
        logger.error(
            "charge_customer: card declined customer_id=%s error=%s code=%s",
            stripe_customer_id[:8] + "***",
            error_msg,
            e.code
        )
        
        note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
        if opportunity_id:
            note_body += f"\nOpportunity ID: {opportunity_id}"
        if description:
            note_body += f"\nDescription: {description}"
        note_body += f"\nStripe Error Code: {e.code}"
        record_payment_failure(ghl_contact_id, "Payment Failed - Card Declined", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": amount_cents,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": True
        }, status_code=200)
    except stripe.error.StripeError as e:
        # Other Stripe errors
        error_msg = f"Stripe error: {str(e)}"
        logger.error(
            "charge_customer: Stripe error customer_id=%s error=%s",
            stripe_customer_id[:8] + "***",
            error_msg
        )
        
        note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
        if opportunity_id:
            note_body += f"\nOpportunity ID: {opportunity_id}"
        if description:
            note_body += f"\nDescription: {description}"
        record_payment_failure(ghl_contact_id, "Payment Failed", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": amount_cents,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": True
        }, status_code=200)
    except Exception as e:
        # Unexpected errors
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(
            "charge_customer: unexpected error customer_id=%s error=%s",
            stripe_customer_id[:8] + "***",
            error_msg,
            exc_info=True
        )
        
        note_body = f"Payment failed: {error_msg}\nStripe Customer ID: {stripe_customer_id}\nAmount: ${amount_decimal:.2f}"
        if opportunity_id:
            note_body += f"\nOpportunity ID: {opportunity_id}"
        if description:
            note_body += f"\nDescription: {description}"
        record_payment_failure(ghl_contact_id, "Payment Failed", note_body)
        
        return JSONResponse({
            "status": "failed",
            "payment_intent_id": None,
            "amount_cents": amount_cents,
            "opportunity_id": opportunity_id,
            "error": error_msg,
            "attempted_charge": True
        }, status_code=200)

