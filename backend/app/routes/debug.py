"""
Debug routes for development and troubleshooting.
"""
import re
import logging
import traceback
import requests
from typing import List, Dict, Any
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..settings import GHL_LOCATION_ID, JOB_STORE, CONTACTS_SEARCH_URL
from ..utils import _ghl_headers
from ..ghl_client import find_contact_record_by_phone
from ..pricing import (
    build_contact_price_breakdown,
    parse_simplified_price_breakdown,
    extract_contact_pricing_from_custom_fields,
)

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


@router.get("/debug/jobs")
def debug_jobs():
    """
    Debug endpoint to see what jobs are currently cached in memory.

    Returns:
        JSON with count, job_ids list, and full jobs dict.
        Useful for troubleshooting during development.
    """
    return {
        "ok": True,
        "count": len(JOB_STORE),
        "job_ids": list(JOB_STORE.keys()),
        "jobs": JOB_STORE,
    }


@router.get("/debug/cors")
def debug_cors(request: Request):
    """
    Debug endpoint to verify CORS configuration.
    
    Returns:
        JSON with origin_received (from request headers) and allowed status.
        Useful for troubleshooting CORS issues.
    """
    origin = request.headers.get("origin")
    return JSONResponse({
        "origin_received": origin,
        "allowed": True,
    }, status_code=200)


@router.get("/debug/quote_crash")
def debug_quote_crash(phone: str):
    """
    Debug endpoint to inspect intermediate values in quote lookup.
    
    Args (query param):
        phone: Phone number to search for
    
    Returns:
        JSON with intermediate debugging values:
        - contact_id: Contact ID if found
        - opp_count: Number of opportunities found
        - selected_opp: Selected opportunity dict (or null)
        - raw_keys_present: List of top-level keys in contact dict
        - opportunities_type: Type of opportunities field
        - custom_fields_type: Type of customFields field
    """
    try:
        phone_normalized = phone.strip() if phone else ""
        
        # Find contact using same logic as /quote/cleaning
        contact = find_contact_record_by_phone(phone_normalized)
        
        if not contact:
            return JSONResponse({
                "contact_id": None,
                "opp_count": 0,
                "selected_opp": None,
                "raw_keys_present": [],
                "opportunities_type": "None",
                "custom_fields_type": "None",
            }, status_code=200)
        
        contact_id = contact.get("id")
        opportunities_raw = contact.get("opportunities")
        opportunities = []
        
        if isinstance(opportunities_raw, list):
            opportunities = opportunities_raw
        elif opportunities_raw is not None:
            opportunities = [opportunities_raw]  # Single dict, wrap in list
        
        # Try to select opportunity (same logic as /quote/cleaning)
        selected_opp = None
        if opportunities:
            try:
                opportunities.sort(key=lambda o: o.get("updatedAt", "") or "", reverse=True)
                open_opps = [o for o in opportunities if isinstance(o, dict) and o.get("status") not in ["won", "lost", "abandoned"]]
                if open_opps:
                    selected_opp = open_opps[0]
                else:
                    selected_opp = opportunities[0] if opportunities else None
            except Exception as e:
                selected_opp = {"error": str(e)}
        
        return JSONResponse({
            "contact_id": contact_id,
            "opp_count": len(opportunities) if isinstance(opportunities, list) else 0,
            "selected_opp": selected_opp,
            "raw_keys_present": list(contact.keys()) if isinstance(contact, dict) else [],
            "opportunities_type": type(opportunities_raw).__name__ if opportunities_raw is not None else "None",
            "custom_fields_type": type(contact.get("customFields")).__name__ if contact.get("customFields") is not None else "None",
        }, status_code=200)
    except Exception as e:
        return JSONResponse({
            "error": str(e),
            "traceback": traceback.format_exc(),
        }, status_code=200)


@router.get("/debug/search_contact_by_phone")
def debug_search_contact_by_phone(phone: str):
    """
    Debug endpoint to search GHL contacts by phone using the official Search Contacts endpoint.

    Args (query param):
        phone: Phone number to search for

    Returns:
        JSON with:
        - input_phone: The phone number that was searched
        - status_code: HTTP status code from GHL API
        - count: Number of contacts found
        - top_matches: Array of contact objects (id, name, phone, email, dateUpdated)
        - raw: First 2-3kb of raw response for debugging
        - location_id_present: Boolean indicating if locationId is configured
        - location_id_last4: Last 4 characters of locationId (for debugging, no full secrets)

    Uses POST /contacts/search endpoint with phone query.
    """
    location_id_present = bool(GHL_LOCATION_ID)
    location_id_last4 = GHL_LOCATION_ID[-4:] if GHL_LOCATION_ID and len(GHL_LOCATION_ID) >= 4 else ""

    if not GHL_LOCATION_ID:
        return JSONResponse(
            {
                "input_phone": phone,
                "status_code": 500,
                "count": 0,
                "top_matches": [],
                "raw": "GHL_LOCATION_ID not set",
                "error": "GHL_LOCATION_ID not configured",
                "location_id_present": False,
                "location_id_last4": "",
            },
            status_code=500,
        )

    # Trim phone string
    phone_trimmed = phone.strip()
    
    # Normalize to digits only for candidate generation
    digits = re.sub(r"\D", "", phone_trimmed)

    # Generate phone candidates in order of preference
    candidates = []
    
    # 1. Prefer "+<digits>" format (e.g., +16022904816)
    if not phone_trimmed.startswith("+"):
        candidates.append("+" + digits)
    else:
        candidates.append(phone_trimmed)
    
    # 2. Try raw digits as fallback
    candidates.append(digits)
    
    # 3. If 10 digits, also try +1<digits>
    if len(digits) == 10:
        candidates.append("+1" + digits)

    # Build request body with locationId in body and filters array
    # Use the first candidate for the debug endpoint
    candidate = candidates[0] if candidates else phone_trimmed
    
    body = {
        "locationId": GHL_LOCATION_ID.strip(),
        "page": 1,
        "pageLimit": 20,
        "filters": [
            {"field": "phone", "operator": "eq", "value": candidate}
        ],
    }

    status_code = 0
    raw_response = ""
    contacts = []

    try:
        # Do NOT send locationId in query params or Location-Id header
        resp = requests.post(
            CONTACTS_SEARCH_URL, headers=_ghl_headers(), json=body, timeout=10
        )
        status_code = resp.status_code
        raw_response = resp.text

        # Try to parse JSON response
        try:
            data = resp.json()
            # Extract contacts from response (handle different possible response structures)
            contacts = data.get("contacts", [])
            if not contacts and isinstance(data, list):
                contacts = data
        except Exception:
            # If JSON parsing fails, return raw text
            return JSONResponse(
                {
                    "input_phone": phone,
                    "status_code": status_code,
                    "count": 0,
                    "top_matches": [],
                    "raw": raw_response[:3000] if len(raw_response) > 3000 else raw_response,
                    "error": "Failed to parse JSON response",
                    "location_id_present": location_id_present,
                    "location_id_last4": location_id_last4,
                    "contacts_search_url": CONTACTS_SEARCH_URL,
                    "locationId_param_sent": True,
                    "locationId_value_type": type(GHL_LOCATION_ID).__name__,
                },
                status_code=200 if resp.ok else status_code,
            )
    except Exception as e:
        error_msg = str(e)
        logger.error("debug_search_contact_by_phone: exception: %s", error_msg)
        return JSONResponse(
            {
                "input_phone": phone,
                "status_code": 0,
                "count": 0,
                "top_matches": [],
                "raw": error_msg[:3000] if len(error_msg) > 3000 else error_msg,
                "error": "Request exception",
                "location_id_present": location_id_present,
                "location_id_last4": location_id_last4,
                "contacts_search_url": CONTACTS_SEARCH_URL,
                "locationId_param_sent": True,
                "locationId_value_type": type(GHL_LOCATION_ID).__name__,
            },
            status_code=500,
        )

    # Build top_matches array with relevant fields
    top_matches = []
    for contact in contacts[:10]:  # Limit to top 10
        match = {
            "id": contact.get("id", ""),
            "name": (
                contact.get("contactName")
                or f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
                or "Unknown"
            ),
            "phone": contact.get("phone", ""),
            "email": contact.get("email", ""),
            "dateUpdated": contact.get("updatedAt", contact.get("dateUpdated", "")),
        }
        top_matches.append(match)

    # Truncate raw response to 2-3kb
    raw_truncated = raw_response[:3000] if len(raw_response) > 3000 else raw_response

    return JSONResponse(
        {
            "input_phone": phone,
            "status_code": status_code,
            "count": len(contacts),
            "top_matches": top_matches,
            "raw": raw_truncated,
            "location_id_present": location_id_present,
            "location_id_last4": location_id_last4,
            "contacts_search_url": CONTACTS_SEARCH_URL,
            "locationId_param_sent": True,
            "locationId_value_type": type(GHL_LOCATION_ID).__name__,
        },
        status_code=200,
    )


@router.get("/debug/contact_pricing")
def debug_contact_pricing(phone: str):
    """
    Debug endpoint to inspect contact-level pricing fields.

    Args (query param):
        phone: Phone number to search for

    Returns:
        JSON with:
        - phone_normalized
        - contact_id
        - custom_fields: [{id, value}]
        - recurring_price: float or null (from contact.customFields)
        - frequency_label: string or null (from contact.customFields)
    """
    try:
        phone_normalized = phone.strip() if phone else ""
        contact = find_contact_record_by_phone(phone_normalized)

        if not contact:
            return JSONResponse(
                {
                    "phone_normalized": phone_normalized,
                    "contact_id": None,
                    "custom_fields": [],
                    "recurring_price": None,
                    "frequency_label": None,
                },
                status_code=200,
            )

        contact_id = contact.get("id")
        custom_fields_raw = contact.get("customFields", [])
        fields_out: List[Dict[str, Any]] = []

        if isinstance(custom_fields_raw, list):
            for cf in custom_fields_raw:
                if isinstance(cf, dict):
                    fields_out.append(
                        {
                            "id": cf.get("id"),
                            "value": cf.get("value"),
                        }
                    )
        elif isinstance(custom_fields_raw, dict):
            for field_id, value in custom_fields_raw.items():
                fields_out.append({"id": field_id, "value": value})

        pricing = extract_contact_pricing_from_custom_fields(contact)

        return JSONResponse(
            {
                "phone_normalized": phone_normalized,
                "contact_id": contact_id,
                "custom_fields": fields_out,
                "recurring_price": pricing.get("recurring_price"),
                "frequency_label": pricing.get("frequency_label"),
            },
            status_code=200,
        )
    except Exception as e:
        return JSONResponse(
            {
                "error": str(e),
                "traceback": traceback.format_exc(),
            },
            status_code=200,
        )


@router.get("/debug/quote_source")
def debug_quote_source(phone: str):
    """
    Debug endpoint to inspect quote parsing source data.
    
    Args (query param):
        phone: Phone number to search for
    
    Returns:
        JSON with:
        - contact_id: Contact ID if found
        - price_breakdown_field: The matched custom field string used as price_breakdown
        - parsed_values: Object with first_clean_price, recurring_price, frequency_label
        - custom_fields_keys: List of all custom field keys found
    """
    try:
        phone_normalized = phone.strip() if phone else ""
        
        # Find contact using same logic as /quote/cleaning
        contact = find_contact_record_by_phone(phone_normalized)
        
        if not contact:
            return JSONResponse({
                "contact_id": None,
                "price_breakdown_field": None,
                "parsed_values": {
                    "first_clean_price": None,
                    "recurring_price": None,
                    "frequency_label": None,
                },
                "custom_fields_keys": [],
            }, status_code=200)
        
        contact_id = contact.get("id")

        # Build breakdown text exactly like /quote/cleaning V1
        price_breakdown_text = build_contact_price_breakdown(contact)

        # Collect custom field ids for debugging
        custom_fields_raw = contact.get("customFields", [])
        custom_field_ids: List[str] = []
        if isinstance(custom_fields_raw, list):
            for cf in custom_fields_raw:
                if isinstance(cf, dict) and cf.get("id"):
                    custom_field_ids.append(str(cf.get("id")))
        elif isinstance(custom_fields_raw, dict):
            custom_field_ids = [str(k) for k in custom_fields_raw.keys()]

        # Parse using the same simplified breakdown parser as /quote/cleaning
        parsed = (
            parse_simplified_price_breakdown(price_breakdown_text)
            if isinstance(price_breakdown_text, str)
            else {
                "service": None,
                "first_clean_price": None,
                "recurring_price": None,
                "frequency_label": None,
                "discount_label": None,
                "addons": [],
            }
        )

        # Also compute contact-level pricing fallbacks for debugging
        contact_pricing = extract_contact_pricing_from_custom_fields(contact)

        return JSONResponse({
            "contact_id": contact_id,
            "price_breakdown_field": price_breakdown_text[:500] + "..." if price_breakdown_text and len(price_breakdown_text) > 500 else price_breakdown_text,
            "parsed_values": {
                "service": parsed.get("service"),
                "first_clean_price": parsed.get("first_clean_price"),
                "recurring_price": parsed.get("recurring_price"),
                "frequency_label": parsed.get("frequency_label"),
                "discount_label": parsed.get("discount_label"),
            },
            "addons": parsed.get("addons") or [],
            "custom_fields_keys": custom_field_ids,
            "custom_fields_count": len(custom_field_ids),
            "contact_pricing_from_custom_fields": contact_pricing,
        }, status_code=200)
    except Exception as e:
        return JSONResponse({
            "error": str(e),
            "traceback": traceback.format_exc(),
        }, status_code=200)

