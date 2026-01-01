"""
Quote retrieval routes.
"""
import logging
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..utils import normalize_phone
from ..ghl_client import find_contact_record_by_phone
from ..pricing import (
    build_contact_price_breakdown,
    parse_simplified_price_breakdown,
    extract_contact_pricing_from_custom_fields,
)

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


@router.get("/quote/cleaning")
async def get_cleaning_quote(phone: str):
    """
    Get cleaning quote (estimated price) for a contact by phone number.

    Args (query param):
        phone: Phone number (may include +, will be normalized)

    Returns:
        JSON with one of:
        - { status: "ready", estimated_price: number, price_breakdown?: string, source: "contact_search" }
        - { status: "pending" } if contact found but no opportunities or no monetaryValue
        - { status: "not_found" } if no contact found
        - { status: "error", error: "quote_failed" } if an exception occurs

    Process:
        1. Normalize phone number (preserve +, trim whitespace)
        2. Find full contact record by phone (includes opportunities and customFields)
        3. Extract estimated_price from most recent open opportunity (or most recent overall)
        4. Extract price_breakdown from customFields
        5. Return appropriate status based on data availability
    """
    try:
        logger.info("get_cleaning_quote: received phone=%s", phone)

        # Normalize phone
        phone_normalized = phone.strip() if phone else ""
        if not phone_normalized:
            logger.info("get_cleaning_quote: empty phone, returning not_found")
            return JSONResponse({"status": "not_found"}, status_code=200)

        # Find full contact record (includes opportunities and customFields)
        # Uses the same search logic as /debug/search_contact_by_phone
        contact = find_contact_record_by_phone(phone_normalized)
        contact_id = contact.get("id") if contact else None
        logger.info("get_cleaning_quote: contact_id=%s for phone=%s", contact_id, phone_normalized)
        
        if not contact:
            logger.info("get_cleaning_quote: no contact found for phone=%s", phone_normalized)
            return JSONResponse({"status": "not_found"}, status_code=200)

        # -----------------------------------------------------
        # V1: Prefer contact customFields as pricing source
        # -----------------------------------------------------
        price_breakdown_from_contact = build_contact_price_breakdown(contact)
        if price_breakdown_from_contact:
            parsed = parse_simplified_price_breakdown(price_breakdown_from_contact)

            service = parsed.get("service")
            first_clean_price = parsed.get("first_clean_price")
            recurring_price = parsed.get("recurring_price")
            frequency_label = parsed.get("frequency_label")
            discount_label = parsed.get("discount_label")
            addons = parsed.get("addons") or []

            if first_clean_price:
                logger.info(
                    "get_cleaning_quote: found price from contact customFields: price=%.2f service=%s frequency=%s",
                    first_clean_price,
                    service,
                    frequency_label,
                )
                return JSONResponse(
                    {
                        "status": "ready",
                        "estimated_price": first_clean_price,
                        "price_breakdown": price_breakdown_from_contact,
                        "source": "contact_search",
                        "service": service,
                        "recurring_price": recurring_price,
                        "frequency": frequency_label,
                        "discount": discount_label,
                        "addons": addons,
                    },
                    status_code=200,
                )

        # -----------------------------------------------------
        # V2: Fallback to opportunity-based pricing
        # -----------------------------------------------------
        pricing_data = extract_contact_pricing_from_custom_fields(contact)
        estimated_price = pricing_data.get("estimated_price")
        price_breakdown = pricing_data.get("price_breakdown")

        if estimated_price and estimated_price > 0:
            logger.info(
                "get_cleaning_quote: found price from opportunity/customFields: price=%.2f",
                estimated_price,
            )
            return JSONResponse(
                {
                    "status": "ready",
                    "estimated_price": estimated_price,
                    "price_breakdown": price_breakdown,
                    "source": "contact_search",
                },
                status_code=200,
            )

        # No pricing found
        logger.info(
            "get_cleaning_quote: contact found but no pricing data available. contact_id=%s",
            contact_id,
        )
        return JSONResponse({"status": "pending"}, status_code=200)

    except Exception as e:
        logger.error(
            "get_cleaning_quote: exception for phone=%s: %s", phone, e, exc_info=True
        )
        return JSONResponse(
            {"status": "error", "error": "quote_failed"}, status_code=500
        )

