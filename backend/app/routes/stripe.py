"""
Payment execution: POST /admin/payments/run (PaymentIntent create + confirm).

The GoHighLevel-era endpoints that used to live here — /stripe/charge,
/stripe/card-status, /stripe/setup-intent and /stripe/webhook — were deleted with
the GHL retirement. They served the legacy cleaning funnel and authenticated with
GHL_WORKFLOW_SECRET. This module now holds exactly one route.
"""
import hashlib
import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional
from fastapi import APIRouter, Request, Header, HTTPException, Query, Body
from fastapi.responses import JSONResponse
import stripe

from ..settings import (
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
)
from ..services.service_auth import (
    PAYMENT_EXECUTOR_HEADER,
    ServiceAuthError,
    require_payment_executor_auth,
)
from ..utils import normalize_phone
from ..supabase_client import (
    link_stripe_customer_to_supabase,
    get_or_create_stripe_customer_for_customer,
    stripe_error_is_no_such_customer,
    clear_stripe_customer_id_for_supabase_customer,
    lookup_supabase_customer_id_by_stripe_customer_id,
    get_payment_status_id_by_key,
    update_payment_by_provider_payment_id,
    get_job_by_id,
    get_customer_by_id,
    get_opportunity_org_id,
    insert_payment,
    update_payment_by_id,
    get_payment_row_by_provider_payment_id,
    _payment_iso_now,
)

logger = logging.getLogger("alloy-dispatcher")

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

# Log Stripe mode at startup (without exposing secrets)
stripe_mode = "live" if STRIPE_SECRET_KEY.startswith("sk_live_") else "test" if STRIPE_SECRET_KEY.startswith("sk_test_") else "unknown"
logger.info("STRIPE_MODE=%s (key prefix: %s)", stripe_mode, STRIPE_SECRET_KEY[:7] + "***" if STRIPE_SECRET_KEY else "None")


def _is_supabase_unique_or_conflict(exc: BaseException) -> bool:
    s = str(exc).lower()
    return "23505" in s or "unique constraint" in s or "duplicate key" in s or "conflict" in s or " 409 " in s or s.startswith("409 ")


router = APIRouter()

# SetupIntent metadata: at least one of these must be present to run GHL/Supabase side effects.
SETUP_INTENT_ALLOY_CORRELATION_KEYS = (
    "org_id",
    "customer_id",
    "booking_id",
    "booking_attempt_id",
    "supabase_contact_id",
    "contact_id",
    "ghl_contact_id",
    "person_id",
)


def _coerce_stripe_metadata_dict(raw: Any) -> Dict[str, Any]:
    """Stripe may send metadata as null, a dict, or a StripeObject; never assume dict."""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return dict(raw)
    except (TypeError, ValueError):
        return {}


def _setup_intent_metadata_has_alloy_correlation(metadata: Dict[str, Any]) -> bool:
    for key in SETUP_INTENT_ALLOY_CORRELATION_KEYS:
        val = metadata.get(key)
        if val is not None and str(val).strip():
            return True
    return False


@router.post("/admin/payments/run")
async def admin_payments_run(
    body: Dict[str, Any] = Body(...),
    x_alloy_payment_executor_secret: Optional[str] = Header(None, alias=PAYMENT_EXECUTOR_HEADER),
):
    """
    Create a payment record and charge the customer's saved payment method via Stripe PaymentIntent.

    AUTHENTICATED INTERNAL SERVICE ENDPOINT (Phase 0 containment).
    Called only by the authenticated Next.js proxy, which performs operator
    authentication, resolves the organization from the session, and verifies the
    operator's access to the job. This executor is authoritative for:
      * service authentication (constant-time, fails closed when unconfigured)
      * organization binding (request org == job org == customer org)
      * financial authority (the amount is resolved from server-side records)

    Body: {
      "job_id": string,
      "org_id": string,                      REQUIRED - trusted org context from the proxy
      "idempotency_key": string,             REQUIRED - stable per charge intent
      "expected_amount_cents"?: number       optional optimistic consistency check
    }

    `amount_cents` is NO LONGER accepted as financial authority. The canonical
    amount is computed here from the job. A caller may supply
    `expected_amount_cents`; a mismatch is rejected before Stripe is invoked.

    LIMITATION (documented, not a redesign): the data model has no payable
    obligation/invoice, so the canonical amount is the existing job total
    (estimated_total_cents, else recurring_total_cents). Introducing a true
    payable-obligation source is Billing work and is explicitly out of scope.

    Administrative override of the amount is NOT supported here. It requires a
    distinct permission, an override reason, server-side bounds and its own
    endpoint contract.
    """
    # --- Service authentication. Before any lookup, before any Stripe call. ---
    try:
        require_payment_executor_auth(x_alloy_payment_executor_secret)
    except ServiceAuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e

    # --- Trusted organization context. Never inferred from job_id alone. ---
    org_id = body.get("org_id") if isinstance(body.get("org_id"), str) else None
    if not org_id or not org_id.strip():
        raise HTTPException(status_code=400, detail="org_id is required")
    org_id = org_id.strip()

    # --- Idempotency is mandatory. Its absence previously meant every retry
    #     created a NEW PaymentIntent. ---
    raw_ik = body.get("idempotency_key")
    if not isinstance(raw_ik, str) or not raw_ik.strip():
        raise HTTPException(status_code=400, detail="idempotency_key is required")

    # Request-time Stripe init (same key as SetupIntent): set before any Stripe call
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="STRIPE_SECRET_KEY is not configured")
    stripe.api_key = STRIPE_SECRET_KEY

    job_id = body.get("job_id") if isinstance(body.get("job_id"), str) else None
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id is required")

    client_idempotency_key: str = raw_ik.strip()[:512]

    logger.info(
        "admin_payments_run: authenticated service request org=%s job_id_prefix=%s",
        org_id,
        job_id[:12],
    )

    pending_uuid = get_payment_status_id_by_key("pending")
    paid_uuid = get_payment_status_id_by_key("paid")
    failed_uuid = get_payment_status_id_by_key("failed")
    if not pending_uuid or not paid_uuid or not failed_uuid:
        raise HTTPException(
            status_code=500,
            detail="Could not resolve payment_statuses (pending/paid/failed). Check payment_statuses table.",
        )

    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # --- ORGANIZATION BINDING -------------------------------------------------
    # request org == job org == customer org. Any mismatch fails BEFORE Stripe.
    # Previously the executor trusted job_id alone, which made it a cross-tenant
    # vector for anyone holding a job id from another organization.
    job_org_id = job.get("org_id")
    if not job_org_id or str(job_org_id) != org_id:
        logger.warning(
            "admin_payments_run: org mismatch request_org=%s job_org=%s job_id_prefix=%s",
            org_id,
            job_org_id,
            job_id[:12],
        )
        # Do not disclose whether the job exists in another organization.
        raise HTTPException(status_code=404, detail="Job not found")

    customer_id = job.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Job has no customer_id")

    customer = get_customer_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    customer_org_id = customer.get("org_id")
    if not customer_org_id or str(customer_org_id) != org_id:
        logger.error(
            "admin_payments_run: customer org mismatch request_org=%s customer_org=%s",
            org_id,
            customer_org_id,
        )
        raise HTTPException(status_code=409, detail="Job and customer belong to different organizations")

    stripe_customer_id = customer.get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(status_code=400, detail="Customer has no stripe_customer_id (card not saved)")

    # --- FINANCIAL AUTHORITY --------------------------------------------------
    # The canonical amount is resolved from server-side records. A caller-supplied
    # amount is NOT authority: previously any positive `amount_cents` was honored,
    # so an unauthenticated caller could charge an arbitrary sum.
    #
    # LIMITATION: there is no payable obligation/invoice in the data model, so the
    # canonical source is the existing job total. Introducing one is Billing work
    # and is deliberately out of Phase 0 scope.
    canonical_amount_cents = int(
        (job.get("estimated_total_cents") or job.get("recurring_total_cents") or 0) or 0
    )
    if canonical_amount_cents < 1:
        raise HTTPException(
            status_code=409,
            detail="Job has no payable amount (estimated_total_cents/recurring_total_cents)",
        )

    # Optimistic consistency check only. Never widens authority.
    expected = body.get("expected_amount_cents")
    if expected is not None:
        if not isinstance(expected, (int, float)) or int(expected) != canonical_amount_cents:
            logger.warning(
                "admin_payments_run: expected amount mismatch org=%s job_id_prefix=%s",
                org_id,
                job_id[:12],
            )
            raise HTTPException(
                status_code=409,
                detail="expected_amount_cents does not match the current payable amount",
            )

    if body.get("amount_cents") is not None:
        # Explicit refusal rather than silent ignore, so any remaining caller is
        # discovered rather than quietly having its intent dropped.
        raise HTTPException(
            status_code=400,
            detail="amount_cents is not accepted; the payable amount is resolved server-side",
        )

    amount_cents = canonical_amount_cents

    org_id = job.get("org_id")
    if not org_id and job.get("opportunity_id"):
        org_id = get_opportunity_org_id(job["opportunity_id"])
    if not org_id:
        org_id = os.getenv("ALLOY_PUBLIC_ORG_ID")

    metadata_insert = {
        "source": "payments_run",
        "requested_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    pt = body.get("payment_target")
    if isinstance(pt, str) and pt.strip():
        metadata_insert["payment_target"] = pt.strip()
    sid = body.get("schedule_id")
    if isinstance(sid, str) and sid.strip():
        metadata_insert["schedule_id"] = sid.strip()
    ah = body.get("ad_hoc_charge_type")
    if isinstance(ah, str) and ah.strip():
        metadata_insert["ad_hoc_charge_type"] = ah.strip()
    if client_idempotency_key:
        metadata_insert["client_idempotency_key"] = client_idempotency_key

    logger.info(
        "admin_payments_run: before insert_payment job_id=%s customer_id=%s org_id=%s amount_cents=%s pending_payment_status_id=%s",
        job_id,
        customer_id,
        org_id,
        amount_cents,
        pending_uuid,
    )

    payment_id = insert_payment(
        job_id=job_id,
        customer_id=customer_id,
        amount_cents=amount_cents,
        payment_status_id=pending_uuid,
        org_id=org_id,
        metadata=metadata_insert,
    )
    if not payment_id:
        raise HTTPException(status_code=500, detail="Failed to create payment record")

    payment_method_id_override = body.get("payment_method_id")
    payment_method_id_override = payment_method_id_override if isinstance(payment_method_id_override, str) else None
    if payment_method_id_override:
        payment_method_id_override = payment_method_id_override.strip() or None
    explicit_payment_method = bool(
        payment_method_id_override and payment_method_id_override.startswith("pm_")
    )
    save_payment_method = body.get("save_payment_method") is True

    default_pm_id = customer.get("default_payment_method_id")
    payment_method_id = default_pm_id
    if explicit_payment_method:
        payment_method_id = payment_method_id_override
        try:
            stripe.PaymentMethod.attach(payment_method_id, customer=stripe_customer_id)
        except stripe.error.InvalidRequestError as e:
            err_s = str(e).lower()
            if "already been attached" not in err_s and "already attached" not in err_s:
                raise
        if save_payment_method:
            try:
                stripe.Customer.modify(
                    stripe_customer_id,
                    invoice_settings={"default_payment_method": payment_method_id},
                )
            except Exception as e:
                logger.warning("admin_payments_run: could not set default payment method %s", e)
    elif not payment_method_id:
        try:
            pm_list = stripe.PaymentMethod.list(customer=stripe_customer_id, type="card", limit=1)
            payment_method_id = pm_list.data[0].id if pm_list.data else None
        except Exception as e:
            logger.warning("admin_payments_run: list payment methods failed %s", e)
            payment_method_id = None

    if not payment_method_id:
        try:
            now_f = _payment_iso_now()
            ok, n = update_payment_by_id(
                payment_id,
                payment_status_id=failed_uuid,
                metadata={"error": "No payment method found for customer"},
                additional_fields={
                    "status": "failed",
                    "status_key": "failed",
                    "failed_at": now_f,
                    "posted_at": None,
                    "paid_at": None,
                    "voided_at": None,
                },
            )
            if not ok or n < 1:
                raise HTTPException(status_code=500, detail="Payment update failed: could not set failed status (0 rows updated)")
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail="Payment update failed: %s" % e)
        raise HTTPException(status_code=400, detail="No payment method found for customer")

    pi_metadata = {
        "job_id": job_id,
        "customer_id": customer_id,
        "payment_id": payment_id,
    }
    pi_kwargs: Dict[str, Any] = {
        "amount": amount_cents,
        "currency": "usd",
        "customer": stripe_customer_id,
        "payment_method": payment_method_id,
        "metadata": pi_metadata,
    }
    if explicit_payment_method:
        pi_kwargs["confirm"] = True
        pi_kwargs["off_session"] = False
    else:
        pi_kwargs["confirm"] = True
        pi_kwargs["off_session"] = True

    stripe_idempotency_key = f"payments_run:{payment_id}"
    if client_idempotency_key:
        stripe_idempotency_key = hashlib.sha256(
            f"admin_payments_run:{job_id}:{client_idempotency_key}".encode()
        ).hexdigest()[:64]
    pi_kwargs["idempotency_key"] = stripe_idempotency_key

    pm_source = (
        "explicit_new_or_saved_pm"
        if explicit_payment_method
        else ("customer_default_pm" if default_pm_id else "stripe_list_first_card")
    )
    logger.info(
        "admin_payments_run: stripe_pi_create_start payment_id=%s job_id=%s amount_cents=%s pm_source=%s pm_id_prefix=%s stripe_idem_prefix=%s off_session=%s client_idem=%s",
        (payment_id[:10] + "…") if payment_id else "",
        (job_id[:12] + "…") if job_id else "",
        amount_cents,
        pm_source,
        (payment_method_id[:10] + "…") if payment_method_id else "",
        (stripe_idempotency_key[:20] + "…") if stripe_idempotency_key else "",
        pi_kwargs.get("off_session"),
        bool(client_idempotency_key),
    )
    t0 = time.perf_counter()
    try:
        payment_intent = stripe.PaymentIntent.create(**pi_kwargs)
    except stripe.error.StripeError as e:
        err_msg = getattr(e, "user_message", None) or str(e)
        try:
            now_f = _payment_iso_now()
            ok, n = update_payment_by_id(
                payment_id,
                payment_status_id=failed_uuid,
                metadata={"error": err_msg},
                additional_fields={
                    "status": "failed",
                    "status_key": "failed",
                    "failed_at": now_f,
                    "posted_at": None,
                    "paid_at": None,
                    "voided_at": None,
                },
            )
            if not ok or n < 1:
                logger.error("admin_payments_run: could not update payment to failed after Stripe error payment_id=%s", payment_id[:8] + "***")
        except RuntimeError:
            logger.exception("admin_payments_run: Supabase update failed after Stripe error")
        raise HTTPException(status_code=500, detail=err_msg)

    logger.info(
        "admin_payments_run: stripe_pi_create_done ms=%.0f payment_id=%s pi_status=%s pi_id_prefix=%s",
        (time.perf_counter() - t0) * 1000,
        (payment_id[:10] + "…") if payment_id else "",
        getattr(payment_intent, "status", None),
        (payment_intent.id[:12] + "…") if getattr(payment_intent, "id", None) else "",
    )

    new_payment_id = payment_id
    ledger_payment_id = payment_id
    try:
        ok, n = update_payment_by_id(
            ledger_payment_id,
            provider_payment_id=payment_intent.id,
            additional_fields={
                "processor_transaction_id": payment_intent.id,
                "provider": "stripe",
                "processor": "stripe",
            },
        )
        if not ok or n < 1:
            raise HTTPException(status_code=500, detail="Payment update failed: could not set provider_payment_id (0 rows updated)")
    except RuntimeError as e:
        if _is_supabase_unique_or_conflict(e):
            existing_row = get_payment_row_by_provider_payment_id(payment_intent.id)
            if existing_row and existing_row.get("id"):
                try:
                    now_f = _payment_iso_now()
                    update_payment_by_id(
                        new_payment_id,
                        payment_status_id=failed_uuid,
                        metadata={
                            "error": "superseded_duplicate_provider_payment_id",
                            "canonical_payment_id": existing_row["id"],
                        },
                        additional_fields={
                            "status": "failed",
                            "status_key": "failed",
                            "failed_at": now_f,
                            "posted_at": None,
                            "paid_at": None,
                            "voided_at": None,
                        },
                    )
                except RuntimeError:
                    logger.warning(
                        "admin_payments_run: could not mark superseded row payment_id=%s",
                        (new_payment_id[:8] + "***") if new_payment_id else "",
                        exc_info=True,
                    )
                ledger_payment_id = existing_row["id"]
            else:
                raise HTTPException(status_code=500, detail="Payment update failed: %s" % e) from e
        else:
            raise HTTPException(status_code=500, detail="Payment update failed: %s" % e) from e

    pi_amount = getattr(payment_intent, "amount", None)
    response_amount_cents = int(pi_amount) if isinstance(pi_amount, int) and pi_amount > 0 else amount_cents
    idempotent_pi_replay = ledger_payment_id != new_payment_id

    if payment_intent.status == "succeeded":
        paid_at = _payment_iso_now()
        try:
            ok, n = update_payment_by_id(
                ledger_payment_id,
                payment_status_id=paid_uuid,
                paid_at=paid_at,
                finalize_job_allocation=True,
                additional_fields={
                    "status": "posted",
                    "status_key": "paid",
                    "posted_at": paid_at,
                    "paid_at": paid_at,
                    "failed_at": None,
                    "voided_at": None,
                    "processor_transaction_id": payment_intent.id,
                    "provider_payment_id": payment_intent.id,
                    "provider": "stripe",
                    "processor": "stripe",
                },
            )
            if not ok:
                raise HTTPException(status_code=500, detail="Payment update failed: could not set paid status")
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail="Payment update failed: %s" % e)
        out: Dict[str, Any] = {
            "ok": True,
            "payment_id": ledger_payment_id,
            "provider_payment_id": payment_intent.id,
            "status": "succeeded",
            "amount_cents": response_amount_cents,
        }
        if idempotent_pi_replay:
            out["idempotent_replay"] = True
        return out

    if payment_intent.status == "requires_action":
        # Leave payment pending; client completes authentication via confirmCardPayment + webhook.
        payload_ra: Dict[str, Any] = {
            "ok": False,
            "requires_action": True,
            "payment_id": ledger_payment_id,
            "provider_payment_id": payment_intent.id,
            "client_secret": payment_intent.client_secret,
            "error": "Payment requires customer authentication",
            "status": "requires_action",
        }
        if idempotent_pi_replay:
            payload_ra["idempotent_replay"] = True
        return JSONResponse(status_code=200, content=payload_ra)

    err_msg = (payment_intent.last_payment_error or {}).get("message", payment_intent.status) if hasattr(payment_intent, "last_payment_error") else payment_intent.status
    try:
        now_f = _payment_iso_now()
        ok, n = update_payment_by_id(
            ledger_payment_id,
            payment_status_id=failed_uuid,
            metadata={"error": err_msg},
            additional_fields={
                "status": "failed",
                "status_key": "failed",
                "failed_at": now_f,
                "posted_at": None,
                "paid_at": None,
                "voided_at": None,
            },
        )
        if not ok or n < 1:
            raise HTTPException(status_code=500, detail="Payment update failed: could not set failed status (0 rows updated)")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail="Payment update failed: %s" % e)
    payload_fail: Dict[str, Any] = {
        "ok": False,
        "payment_id": ledger_payment_id,
        "provider_payment_id": payment_intent.id,
        "error": err_msg or str(payment_intent.status),
        "status": payment_intent.status,
    }
    if idempotent_pi_replay:
        payload_fail["idempotent_replay"] = True
    return JSONResponse(status_code=400, content=payload_fail)


def record_payment_failure(ghl_contact_id: Optional[str], title: str, body: str) -> None:
    """
    Helper to record payment failure in GHL: add tag and create note.
    Safe/no-op if ghl_contact_id is missing.
    """
    if not ghl_contact_id:
        return
    
    add_tag_to_contact(ghl_contact_id, "payment:failed")
    create_contact_note(ghl_contact_id, title, body)


