"""
Discount code validation and redemption routes.
"""
import logging
import requests
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..supabase_client import (
    resolve_contact_id_from_ghl,
    find_contact_by_email,
    find_contact_by_phone,
    resolve_or_create_contact_and_customer,
    normalize_phone as normalize_phone_supa,
)
from ..ghl_client import ensure_contact_has_tag
from ..settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


class ValidateDiscountRequest(BaseModel):
    code: str
    ghl_contact_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    quote_subtotal: float
    vertical_key: str = "cleaning"
    booking_attempt_id: Optional[str] = None


class ValidateDiscountResponse(BaseModel):
    valid: bool
    reason: Optional[str] = None
    discount_code_id: Optional[str] = None
    discount_amount: Optional[float] = None
    quote_total: Optional[float] = None
    supa_contact_id: Optional[str] = None
    supa_customer_id: Optional[str] = None
    # New: discount program (when code maps to discount_programs, not legacy discount_codes)
    discount_program_id: Optional[str] = None
    discount_program_code: Optional[str] = None
    program_type: Optional[str] = None


class RedeemDiscountRequest(BaseModel):
    code: str
    ghl_contact_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    opportunity_id: Optional[str] = None
    job_id: Optional[str] = None
    quote_subtotal: float
    discount_amount: float
    quote_total: float


class RedeemDiscountResponse(BaseModel):
    success: bool
    reason: Optional[str] = None


class UnredeemDiscountRequest(BaseModel):
    code: str
    ghl_contact_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class UnredeemDiscountResponse(BaseModel):
    released: bool
    reason: Optional[str] = None


def _get_supabase_headers():
    """Get PostgREST headers for Supabase."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _get_supabase_base_url():
    """Get PostgREST base URL."""
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not configured")
    base_url = SUPABASE_URL.rstrip("/")
    return f"{base_url}/rest/v1"


def resolve_contact_id_for_discount(
    ghl_contact_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
) -> Optional[str]:
    """
    Resolve Supabase contact_id from GHL contact_id, email, or phone.
    Returns None if contact cannot be resolved.
    """
    # Priority 1: GHL contact_id via external_mappings
    if ghl_contact_id:
        supabase_contact_id = resolve_contact_id_from_ghl(ghl_contact_id)
        if supabase_contact_id:
            logger.info(
                "DISCOUNT_VALIDATE: Resolved contact_id from GHL ghl_contact_id=%s supabase_contact_id=%s",
                ghl_contact_id,
                supabase_contact_id
            )
            return supabase_contact_id

    # Priority 2: Email lookup
    if email:
        contact = find_contact_by_email(email.strip().lower())
        if contact:
            contact_id = contact.get("id")
            logger.info(
                "DISCOUNT_VALIDATE: Resolved contact_id from email email=%s contact_id=%s",
                email[:3] + "***",
                contact_id
            )
            return contact_id

    # Priority 3: Phone lookup
    if phone:
        contact = find_contact_by_phone(phone.strip())
        if contact:
            contact_id = contact.get("id")
            logger.info(
                "DISCOUNT_VALIDATE: Resolved contact_id from phone phone=%s contact_id=%s",
                phone[:4] + "***",
                contact_id
            )
            return contact_id

    logger.warning(
        "DISCOUNT_VALIDATE: Could not resolve contact_id ghl_contact_id=%s email=%s phone=%s",
        ghl_contact_id,
        email[:3] + "***" if email else None,
        phone[:4] + "***" if phone else None
    )
    return None


@router.post("/discounts/validate", response_model=ValidateDiscountResponse)
async def validate_discount(request: ValidateDiscountRequest):
    """
    Validate a discount code and check if it can be used by this contact.
    
    Returns:
        - valid: true if code is valid and can be used
        - reason: "invalid" if code not found, "already_used" if already redeemed
        - discount_code_id, discount_amount, quote_total: if valid
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("DISCOUNT_VALIDATE: Supabase not configured")
        return JSONResponse(
            {"valid": False, "reason": "service_unavailable"},
            status_code=503
        )

    # Normalize code
    code_normalized = request.code.strip().upper()
    booking_attempt_id = request.booking_attempt_id

    logger.info(
        "DISCOUNT_VALIDATE booking_attempt_id=%s code=%s email=%s phone=%s quote_subtotal=%.2f vertical_key=%s",
        booking_attempt_id or "None",
        code_normalized,
        (request.email or "")[:3] + "***" if request.email else "None",
        (request.phone or "")[:4] + "***" if request.phone else "None",
        request.quote_subtotal,
        request.vertical_key,
    )

    try:
        base_url = _get_supabase_base_url()
        headers = _get_supabase_headers()

        # 1. Look up discount code
        discount_url = f"{base_url}/discount_codes"
        discount_params = {
            "select": "id,code,discount_type,discount_value,is_active,applies_to_vertical_slug,first_job_only,starts_at,ends_at,ghl_tag",
            "code": f"eq.{code_normalized}",
            "limit": "1",
        }

        discount_response = requests.get(
            discount_url, headers=headers, params=discount_params, timeout=10
        )
        
        if not discount_response.ok:
            logger.error(
                "DISCOUNT_VALIDATE: Failed to query discount_codes status=%d error=%s",
                discount_response.status_code,
                discount_response.text[:200]
            )
            return JSONResponse(
                {"valid": False, "reason": "service_error"},
                status_code=500
            )

        discount_data = discount_response.json()
        if not discount_data or len(discount_data) == 0:
            logger.info("DISCOUNT_VALIDATE: Code not found code=%s", code_normalized)
            return JSONResponse({
                "valid": False,
                "reason": "invalid"
            })

        discount_code_row = discount_data[0]
        discount_code_id = discount_code_row.get("id")
        discount_type = discount_code_row.get("discount_type")
        discount_value = discount_code_row.get("discount_value")
        is_active = discount_code_row.get("is_active", True)
        applies_to_vertical_slug = discount_code_row.get("applies_to_vertical_slug")
        starts_at = discount_code_row.get("starts_at")
        ends_at = discount_code_row.get("ends_at")
        first_job_only = discount_code_row.get("first_job_only", False)
        
        # Validate is_active
        if not is_active:
            logger.info(
                "DISCOUNT_VALIDATE: Code inactive code=%s discount_code_id=%s",
                code_normalized,
                discount_code_id
            )
            return JSONResponse({
                "valid": False,
                "reason": "invalid"
            })
        
        # Validate starts_at
        if starts_at:
            try:
                starts_dt = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                if now < starts_dt:
                    logger.info(
                        "DISCOUNT_VALIDATE: Code not yet started code=%s discount_code_id=%s starts_at=%s",
                        code_normalized,
                        discount_code_id,
                        starts_at
                    )
                    return JSONResponse({
                        "valid": False,
                        "reason": "invalid"
                    })
            except (ValueError, AttributeError) as e:
                logger.warning(
                    "DISCOUNT_VALIDATE: Invalid starts_at format code=%s starts_at=%s error=%s",
                    code_normalized,
                    starts_at,
                    str(e)
                )
        
        # Validate ends_at
        if ends_at:
            try:
                ends_dt = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                if now > ends_dt:
                    logger.info(
                        "DISCOUNT_VALIDATE: Code expired code=%s discount_code_id=%s ends_at=%s",
                        code_normalized,
                        discount_code_id,
                        ends_at
                    )
                    return JSONResponse({
                        "valid": False,
                        "reason": "invalid"
                    })
            except (ValueError, AttributeError) as e:
                logger.warning(
                    "DISCOUNT_VALIDATE: Invalid ends_at format code=%s ends_at=%s error=%s",
                    code_normalized,
                    ends_at,
                    str(e)
                )
        
        # Validate applies_to_vertical_slug
        if applies_to_vertical_slug and applies_to_vertical_slug != request.vertical_key:
            logger.info(
                "DISCOUNT_VALIDATE: Code does not apply to vertical code=%s discount_code_id=%s applies_to=%s requested=%s",
                code_normalized,
                discount_code_id,
                applies_to_vertical_slug,
                request.vertical_key
            )
            return JSONResponse({
                "valid": False,
                "reason": "invalid"
            })
        
        # Validate discount_type and discount_value
        if discount_type not in ["percent", "fixed"]:
            logger.error(
                "DISCOUNT_VALIDATE: Invalid discount_type code=%s discount_code_id=%s discount_type=%s",
                code_normalized,
                discount_code_id,
                discount_type
            )
            return JSONResponse({
                "valid": False,
                "reason": "service_error"
            })
        
        if discount_value is None or discount_value <= 0:
            logger.error(
                "DISCOUNT_VALIDATE: Invalid discount_value code=%s discount_code_id=%s discount_value=%s",
                code_normalized,
                discount_code_id,
                discount_value
            )
            return JSONResponse({
                "valid": False,
                "reason": "service_error"
            })

        # 2. Resolve or create contact (so we can enforce uniqueness)
        normalized_email = request.email.strip().lower() if request.email else None
        normalized_phone = normalize_phone_supa(request.phone) if request.phone else None
        supabase_contact_id, supa_customer_id, resolution_path = resolve_or_create_contact_and_customer(
            email=normalized_email,
            phone=normalized_phone,
            name=None,
        )

        if supabase_contact_id:
            logger.info(
                "DISCOUNT_VALIDATE: resolved contact resolution_path=%s supa_contact_id=%s supa_customer_id=%s",
                resolution_path,
                supabase_contact_id[:8] + "***" if len(supabase_contact_id) > 8 else supabase_contact_id,
                supa_customer_id[:8] + "***" if supa_customer_id and len(supa_customer_id) > 8 else (supa_customer_id or "None"),
            )

        # 3. Enforce uniqueness: one redemption per (discount_code_id, customer_id)
        if supabase_contact_id and supa_customer_id:
            redemption_url = f"{base_url}/discount_redemptions"
            redemption_params = {
                "select": "id",
                "discount_code_id": f"eq.{discount_code_id}",
                "customer_id": f"eq.{supa_customer_id}",
                "limit": "1",
            }
            redemption_response = requests.get(
                redemption_url, headers=headers, params=redemption_params, timeout=10
            )
            if redemption_response.ok:
                redemption_data = redemption_response.json()
                if redemption_data and len(redemption_data) > 0:
                    logger.info(
                        "DISCOUNT_VALIDATE_ALREADY_USED booking_attempt_id=%s customer_id=%s discount_code_id=%s code=%s",
                        booking_attempt_id or "None",
                        supa_customer_id[:8] + "***" if len(supa_customer_id) > 8 else supa_customer_id,
                        discount_code_id,
                        code_normalized,
                    )
                    return JSONResponse(
                        {
                            "ok": False,
                            "reason": "discount_already_used",
                            "message": "That promo code has already been used for this customer.",
                            "booking_attempt_id": booking_attempt_id,
                        },
                        status_code=409,
                    )
        elif supabase_contact_id:
            logger.warning(
                "DISCOUNT_VALIDATE: no customer_id, skipping uniqueness enforcement code=%s",
                code_normalized,
            )
        else:
            logger.warning(
                "DISCOUNT_VALIDATE: no contact (missing email+phone), skipping uniqueness enforcement code=%s",
                code_normalized,
            )

        # 4. Calculate discount
        if discount_type == "percent":
            discount_amount = round(request.quote_subtotal * (float(discount_value) / 100.0), 2)
        elif discount_type == "fixed":
            discount_amount = min(float(discount_value), request.quote_subtotal)
        else:
            discount_amount = 0.0
        
        # Ensure total doesn't go negative
        quote_total = max(request.quote_subtotal - discount_amount, 0.0)
        discount_amount = round(discount_amount, 2)
        quote_total = round(quote_total, 2)

        logger.info(
            "DISCOUNT_VALIDATE: Code valid code=%s discount_code_id=%s discount_type=%s discount_value=%s discount_amount=%.2f quote_total=%.2f",
            code_normalized,
            discount_code_id,
            discount_type,
            discount_value,
            discount_amount,
            quote_total
        )

        payload = {
            "valid": True,
            "discount_code_id": discount_code_id,
            "discount_amount": round(discount_amount, 2),
            "quote_total": round(quote_total, 2),
        }
        if supabase_contact_id:
            payload["supa_contact_id"] = supabase_contact_id
        if supa_customer_id:
            payload["supa_customer_id"] = supa_customer_id
        return JSONResponse(payload)

    except Exception as e:
        logger.error(
            "DISCOUNT_VALIDATE: Exception code=%s error=%s",
            code_normalized,
            str(e),
            exc_info=True
        )
        return JSONResponse(
            {"valid": False, "reason": "service_error"},
            status_code=500
        )


@router.post("/discounts/redeem", response_model=RedeemDiscountResponse)
async def redeem_discount(request: RedeemDiscountRequest):
    """
    Record a discount redemption in Supabase and add GHL tag.
    
    Returns:
        - success: true if redemption recorded
        - reason: "already_used" if UNIQUE violation
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("DISCOUNT_REDEEM: Supabase not configured")
        return JSONResponse(
            {"success": False, "reason": "service_unavailable"},
            status_code=503
        )

    # Normalize code
    code_normalized = request.code.strip().upper()
    
    logger.info(
        "DISCOUNT_REDEEM: Redeeming code=%s ghl_contact_id=%s quote_subtotal=%.2f discount_amount=%.2f",
        code_normalized,
        request.ghl_contact_id,
        request.quote_subtotal,
        request.discount_amount
    )

    try:
        base_url = _get_supabase_base_url()
        headers = _get_supabase_headers()

        # 1. Resolve contact_id
        contact_id = resolve_contact_id_for_discount(
            ghl_contact_id=request.ghl_contact_id,
            email=request.email,
            phone=request.phone,
        )

        if not contact_id:
            logger.error(
                "DISCOUNT_REDEEM: Cannot resolve contact_id ghl_contact_id=%s",
                request.ghl_contact_id
            )
            return JSONResponse({
                "success": False,
                "reason": "contact_not_found"
            })

        # 2. Resolve discount_code_id
        discount_url = f"{base_url}/discount_codes"
        discount_params = {
            "select": "id,ghl_tag",
            "code": f"eq.{code_normalized}",
            "limit": "1",
        }

        discount_response = requests.get(
            discount_url, headers=headers, params=discount_params, timeout=10
        )

        if not discount_response.ok or not discount_response.json():
            logger.error("DISCOUNT_REDEEM: Discount code not found code=%s", code_normalized)
            return JSONResponse({
                "success": False,
                "reason": "invalid_code"
            })

        discount_code_row = discount_response.json()[0]
        discount_code_id = discount_code_row.get("id")
        ghl_tag = discount_code_row.get("ghl_tag")

        # 3. Insert redemption (idempotent via UNIQUE constraint)
        # Guard: Warn if values look incorrectly scaled (e.g., subtotal < 10 when expected > 100)
        if request.quote_subtotal > 0 and request.quote_subtotal < 10:
            logger.warning(
                "DISCOUNT_REDEEM: Potential scaling issue detected code=%s quote_subtotal=%.2f (expected > 10 for typical quotes)",
                code_normalized,
                request.quote_subtotal
            )
        
        redemption_url = f"{base_url}/discount_redemptions"
        redemption_payload = {
            "discount_code_id": discount_code_id,
            "discount_code": code_normalized,
            "contact_id": contact_id,
            "opportunity_id": request.opportunity_id,
            "job_id": request.job_id,
            "quote_subtotal": request.quote_subtotal,
            "discount_amount": request.discount_amount,
            "quote_total": request.quote_total,
        }

        redemption_response = requests.post(
            redemption_url, headers=headers, json=redemption_payload, timeout=10
        )

        if not redemption_response.ok:
            error_text = redemption_response.text[:500]
            # Check for UNIQUE violation (already redeemed)
            if "23505" in error_text or "unique" in error_text.lower():
                logger.info(
                    "DISCOUNT_REDEEM: Already redeemed code=%s contact_id=%s (idempotent - redemption exists)",
                    code_normalized,
                    contact_id
                )
                # Still apply tag even if already redeemed (idempotent)
                if ghl_tag:
                    tag_name = ghl_tag
                else:
                    tag_name = f"discount:{code_normalized}"
                
                logger.info(
                    "DISCOUNT_REDEEM: applying_ghl_tag tag=%s contact_id=%s code=%s (already_redeemed)",
                    tag_name,
                    request.ghl_contact_id,
                    code_normalized
                )
                tag_success = ensure_contact_has_tag(request.ghl_contact_id, tag_name)
                logger.info(
                    "DISCOUNT_REDEEM: applied_ghl_tag success=%s code=%s ghl_contact_id=%s tag=%s (already_redeemed)",
                    tag_success,
                    code_normalized,
                    request.ghl_contact_id,
                    tag_name
                )
                
                return JSONResponse({
                    "success": False,
                    "reason": "already_used"
                })
            
            logger.error(
                "DISCOUNT_REDEEM: Failed to insert redemption status=%d error=%s",
                redemption_response.status_code,
                error_text
            )
            return JSONResponse({
                "success": False,
                "reason": "insert_failed"
            })

        # 4. Add GHL tag (use ghl_tag from schema if present, otherwise default format)
        # Determine tag name
        if ghl_tag:
            tag_name = ghl_tag
        else:
            tag_name = f"discount:{code_normalized}"
        
        logger.info(
            "DISCOUNT_REDEEM: applying_ghl_tag tag=%s contact_id=%s code=%s",
            tag_name,
            request.ghl_contact_id,
            code_normalized
        )
        
        tag_success = ensure_contact_has_tag(request.ghl_contact_id, tag_name)
        
        if tag_success:
            logger.info(
                "DISCOUNT_REDEEM: applied_ghl_tag success=true code=%s discount_code_id=%s ghl_contact_id=%s tag=%s",
                code_normalized,
                discount_code_id,
                request.ghl_contact_id,
                tag_name
            )
        else:
            logger.warning(
                "DISCOUNT_REDEEM: applied_ghl_tag success=false code=%s discount_code_id=%s ghl_contact_id=%s tag=%s",
                code_normalized,
                discount_code_id,
                request.ghl_contact_id,
                tag_name
            )

        logger.info(
            "DISCOUNT_REDEEM: Success code=%s discount_code_id=%s contact_id=%s discount_amount=%.2f quote_total=%.2f",
            code_normalized,
            discount_code_id,
            contact_id,
            request.discount_amount,
            request.quote_total
        )

        return JSONResponse({
            "success": True
        })

    except Exception as e:
        logger.error(
            "DISCOUNT_REDEEM: Exception code=%s error=%s",
            code_normalized,
            str(e),
            exc_info=True
        )
        return JSONResponse(
            {"success": False, "reason": "service_error"},
            status_code=500
        )


@router.post("/discounts/unredeem", response_model=UnredeemDiscountResponse)
async def unredeem_discount(request: UnredeemDiscountRequest):
    """
    Release a discount redemption (delete from discount_redemptions).
    Only releases redemptions where opportunity_id IS NULL AND job_id IS NULL.
    
    Returns:
        - released: true if redemption was deleted
        - reason: error reason if failed
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("DISCOUNT_UNREDEEM: Supabase not configured")
        return JSONResponse(
            {"released": False, "reason": "service_unavailable"},
            status_code=503
        )

    # Normalize code
    code_normalized = request.code.strip().upper()
    
    logger.info(
        "DISCOUNT_UNREDEEM: Releasing redemption code=%s ghl_contact_id=%s",
        code_normalized,
        request.ghl_contact_id
    )

    try:
        base_url = _get_supabase_base_url()
        headers = _get_supabase_headers()

        # 1. Resolve contact_id
        contact_id = resolve_contact_id_for_discount(
            ghl_contact_id=request.ghl_contact_id,
            email=request.email,
            phone=request.phone,
        )

        if not contact_id:
            logger.warning(
                "DISCOUNT_UNREDEEM: Cannot resolve contact_id code=%s ghl_contact_id=%s email=%s phone=%s",
                code_normalized,
                request.ghl_contact_id,
                request.email[:3] + "***" if request.email else None,
                request.phone[:4] + "***" if request.phone else None
            )
            return JSONResponse({
                "released": False,
                "reason": "contact_not_found"
            })

        # 2. Resolve discount_code_id
        discount_url = f"{base_url}/discount_codes"
        discount_params = {
            "select": "id",
            "code": f"eq.{code_normalized}",
            "limit": "1",
        }

        discount_response = requests.get(
            discount_url, headers=headers, params=discount_params, timeout=10
        )

        if not discount_response.ok or not discount_response.json():
            logger.warning("DISCOUNT_UNREDEEM: Discount code not found code=%s", code_normalized)
            return JSONResponse({
                "released": False,
                "reason": "invalid_code"
            })

        discount_code_id = discount_response.json()[0].get("id")

        # 3. Delete redemption where opportunity_id IS NULL AND job_id IS NULL
        redemption_url = f"{base_url}/discount_redemptions"
        delete_params = {
            "contact_id": f"eq.{contact_id}",
            "discount_code_id": f"eq.{discount_code_id}",
            "opportunity_id": "is.null",
            "job_id": "is.null",
        }

        # Use Prefer: return=representation to get deleted rows back
        delete_headers = headers.copy()
        delete_headers["Prefer"] = "return=representation"
        
        delete_response = requests.delete(
            redemption_url, headers=delete_headers, params=delete_params, timeout=10
        )

        if not delete_response.ok:
            logger.error(
                "DISCOUNT_UNREDEEM: Failed to delete redemption status=%d error=%s",
                delete_response.status_code,
                delete_response.text[:200]
            )
            return JSONResponse({
                "released": False,
                "reason": "delete_failed"
            })

        # Check if any rows were deleted (PostgREST returns deleted rows in response body)
        deleted_rows = delete_response.json() if delete_response.text else []
        
        if deleted_rows and len(deleted_rows) > 0:
            logger.info(
                "DISCOUNT_UNREDEEM: Released redemption code=%s discount_code_id=%s contact_id=%s",
                code_normalized,
                discount_code_id,
                contact_id
            )
            return JSONResponse({
                "released": True
            })
        else:
            logger.info(
                "DISCOUNT_UNREDEEM: No matching redemption found (may already be linked to opportunity/job) code=%s discount_code_id=%s contact_id=%s",
                code_normalized,
                discount_code_id,
                contact_id
            )
            return JSONResponse({
                "released": False,
                "reason": "not_found_or_linked"
            })

    except Exception as e:
        logger.error(
            "DISCOUNT_UNREDEEM: Exception code=%s error=%s",
            code_normalized,
            str(e),
            exc_info=True
        )
        return JSONResponse(
            {"released": False, "reason": "service_error"},
            status_code=500
        )

