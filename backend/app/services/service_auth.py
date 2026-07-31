"""
Internal service authentication for backend endpoints called by a trusted proxy.

WHY THIS EXISTS
The Next.js BFF performs operator authentication, org resolution and resource
authorization, then calls the Python executor. Until Phase 0 the executor
trusted that arrangement implicitly: POST /admin/payments/run had no
authentication at all, so the security boundary existed in one layer only.

An archived audit recorded exactly this and deferred it:
docs/archive/2026-05-02-docs-reset/implementation/ADMIN_API_REMEDIATION_BATCH_3.md:35
  "Stripe charge creation, ledger posting, and any reuse of schedule_id /
   amounts inside Python must be enforced in the backend; audit or harden
   there separately."

This module is that enforcement. Both layers become authoritative for their own
responsibilities: the proxy for operator authorization, the executor for service
authentication, org binding and financial authority.

NOTE ON THE EXISTING PATTERN
POST /stripe/charge already gates on X-ALLOY-WORKFLOW-SECRET, but compares with
`!=` (stripe.py:1623), which is not constant time. New call sites use
`verify_service_secret` below.
"""

from __future__ import annotations

import hmac
import logging
from typing import Optional

from ..settings import PAYMENT_EXECUTOR_SECRET

logger = logging.getLogger(__name__)

PAYMENT_EXECUTOR_HEADER = "X-ALLOY-PAYMENT-EXECUTOR-SECRET"


class ServiceAuthError(Exception):
    """Raised when a service credential is missing, unconfigured, or invalid."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def verify_service_secret(candidate: Optional[str], expected: str, *, label: str) -> None:
    """
    Constant-time credential check.

    FAILS CLOSED when the secret is absent from server configuration: an
    unconfigured deployment must refuse the operation, never fall through to
    "no secret required". That fallthrough is precisely how the payment
    executor came to be unauthenticated.

    Responses deliberately do not distinguish "unconfigured" from "wrong
    credential" to the caller beyond the status code, and never echo any part
    of the candidate.
    """
    if not expected:
        logger.error("%s: service secret is not configured; refusing the operation", label)
        raise ServiceAuthError(503, "Service credential is not configured on the server")

    if not candidate:
        logger.warning("%s: missing service credential header", label)
        raise ServiceAuthError(401, "Unauthorized")

    if not hmac.compare_digest(candidate, expected):
        logger.warning("%s: invalid service credential", label)
        raise ServiceAuthError(401, "Unauthorized")


def require_payment_executor_auth(candidate: Optional[str]) -> None:
    """Gate for the payment executor. Dedicated secret, not the GHL workflow one."""
    verify_service_secret(candidate, PAYMENT_EXECUTOR_SECRET, label="payment_executor")
