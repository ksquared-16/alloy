"""
Phase 0 commit 8 — payment executor containment.

Proves the executor is authoritative for service authentication, organization
binding and financial authority.

These are BEHAVIORAL tests: they invoke the real handler coroutine. Stripe is
replaced by a fake module that RECORDS any call, so "no unauthorized request
reaches Stripe" is asserted directly rather than inferred from source text.

NO LIVE CHARGE is possible: the fake Stripe has no network access, and every
negative case is rejected before the handler would call it.
"""

import asyncio
import hmac
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# settings.py requires Stripe env at import time (house convention, mirrors
# tests/test_twilio_inbound_signature.py).
os.environ.setdefault("STRIPE_SECRET_KEY", "unit_test_stripe_secret_placeholder")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "unit_test_stripe_webhook_placeholder")
os.environ.setdefault("PAYMENT_EXECUTOR_SECRET", "test-payment-executor-secret")

# The `stripe` SDK is not installed in this environment. Injecting a fake before
# importing the route lets the tests exercise the real handler AND assert that
# the provider is never touched on a rejected request.
_fake_stripe = MagicMock(name="stripe")
sys.modules.setdefault("stripe", _fake_stripe)
# NOTE: do NOT inject a fake `twilio` here. A MagicMock in sys.modules shadows
# the real package for every sibling test in the same process, breaking
# `from twilio.request_validator import RequestValidator` with the misleading
# "'twilio' is not a package". Only inject what this module actually needs.

from app import settings as app_settings  # noqa: E402
from app.services.service_auth import ServiceAuthError, verify_service_secret  # noqa: E402
from fastapi import HTTPException  # noqa: E402

# settings captured the environment at ITS import, which may have happened via a
# sibling test module before this one ran. Set the value explicitly rather than
# depending on import order.
app_settings.PAYMENT_EXECUTOR_SECRET = "test-payment-executor-secret"

SECRET = "test-payment-executor-secret"
ORG_A = "aaaaaaaa-0000-4000-8000-000000000001"
ORG_B = "bbbbbbbb-0000-4000-8000-000000000002"
JOB = "11111111-0000-4000-8000-000000000009"


def _run(coro):
    return asyncio.run(coro)


def _call(body, secret=SECRET):
    import app.routes.stripe as stripe_routes

    return _run(stripe_routes.admin_payments_run(body=body, x_alloy_payment_executor_secret=secret))


def _valid_body(**over):
    payload = {"job_id": JOB, "org_id": ORG_A, "idempotency_key": "idem-1"}
    payload.update(over)
    return payload


class TestConstantTimeServiceAuth(unittest.TestCase):
    def test_missing_server_configuration_fails_closed(self):
        # An unconfigured deployment must REFUSE, never fall through to "no
        # secret required" — that fallthrough is how the executor came to be
        # unauthenticated in the first place.
        with self.assertRaises(ServiceAuthError) as ctx:
            verify_service_secret("anything", "", label="test")
        self.assertEqual(ctx.exception.status_code, 503)

    def test_missing_credential_is_unauthorized(self):
        with self.assertRaises(ServiceAuthError) as ctx:
            verify_service_secret(None, SECRET, label="test")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_invalid_credential_is_unauthorized(self):
        with self.assertRaises(ServiceAuthError) as ctx:
            verify_service_secret("wrong", SECRET, label="test")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_valid_credential_passes(self):
        verify_service_secret(SECRET, SECRET, label="test")  # must not raise

    def test_comparison_is_constant_time(self):
        # The pre-existing /stripe/charge gate compares with `!=`
        # (stripe.py:1623). New call sites must not.
        import app.services.service_auth as mod

        with open(mod.__file__, "r", encoding="utf-8") as fh:
            self.assertIn("hmac.compare_digest", fh.read())
        self.assertTrue(hmac.compare_digest(SECRET, SECRET))

    def test_error_detail_never_echoes_the_candidate(self):
        with self.assertRaises(ServiceAuthError) as ctx:
            verify_service_secret("super-secret-guess", SECRET, label="test")
        self.assertNotIn("super-secret-guess", ctx.exception.detail)
        self.assertEqual(ctx.exception.detail, "Unauthorized")


class TestExecutorRejectsBeforeStripe(unittest.TestCase):
    """Every rejection must occur before the provider is touched."""

    def setUp(self):
        _fake_stripe.reset_mock()

    def _assert_stripe_untouched(self):
        self.assertFalse(
            _fake_stripe.PaymentIntent.create.called,
            "a rejected request must never reach Stripe",
        )

    def test_unauthenticated_request_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _call(_valid_body(), secret=None)
        self.assertEqual(ctx.exception.status_code, 401)
        self._assert_stripe_untouched()

    def test_invalid_credential_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _call(_valid_body(), secret="not-the-secret")
        self.assertEqual(ctx.exception.status_code, 401)
        self._assert_stripe_untouched()

    def test_missing_org_context_is_rejected(self):
        body = _valid_body()
        del body["org_id"]
        with self.assertRaises(HTTPException) as ctx:
            _call(body)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("org_id", ctx.exception.detail)
        self._assert_stripe_untouched()

    def test_missing_idempotency_key_is_rejected(self):
        body = _valid_body()
        del body["idempotency_key"]
        with self.assertRaises(HTTPException) as ctx:
            _call(body)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("idempotency_key", ctx.exception.detail)
        self._assert_stripe_untouched()

    def test_caller_supplied_amount_is_refused_outright(self):
        # Explicit refusal rather than silent ignore, so any remaining caller is
        # discovered instead of quietly having its intent dropped.
        with patch("app.routes.stripe.get_payment_status_id_by_key", return_value="status-uuid"), patch(
            "app.routes.stripe.get_job_by_id",
            return_value={"id": JOB, "org_id": ORG_A, "customer_id": "cust-1", "estimated_total_cents": 5000},
        ), patch(
            "app.routes.stripe.get_customer_by_id",
            return_value={"id": "cust-1", "org_id": ORG_A, "stripe_customer_id": "cus_x"},
        ):
            with self.assertRaises(HTTPException) as ctx:
                _call(_valid_body(amount_cents=1))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("amount_cents is not accepted", ctx.exception.detail)
        self._assert_stripe_untouched()

    def test_cross_org_job_is_not_reachable_and_is_not_disclosed(self):
        # The job exists, but belongs to another organization. The response is
        # identical to a genuinely absent job, so this is not an existence oracle.
        with patch("app.routes.stripe.get_payment_status_id_by_key", return_value="status-uuid"), patch(
            "app.routes.stripe.get_job_by_id",
            return_value={"id": JOB, "org_id": ORG_B, "customer_id": "cust-1", "estimated_total_cents": 5000},
        ):
            with self.assertRaises(HTTPException) as ctx:
                _call(_valid_body(org_id=ORG_A))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Job not found")
        self._assert_stripe_untouched()

    def test_customer_in_another_org_is_rejected(self):
        with patch("app.routes.stripe.get_payment_status_id_by_key", return_value="status-uuid"), patch(
            "app.routes.stripe.get_job_by_id",
            return_value={"id": JOB, "org_id": ORG_A, "customer_id": "cust-1", "estimated_total_cents": 5000},
        ), patch(
            "app.routes.stripe.get_customer_by_id",
            return_value={"id": "cust-1", "org_id": ORG_B, "stripe_customer_id": "cus_x"},
        ):
            with self.assertRaises(HTTPException) as ctx:
                _call(_valid_body())
        self.assertEqual(ctx.exception.status_code, 409)
        self._assert_stripe_untouched()

    def test_expected_amount_mismatch_is_rejected(self):
        with patch("app.routes.stripe.get_payment_status_id_by_key", return_value="status-uuid"), patch(
            "app.routes.stripe.get_job_by_id",
            return_value={"id": JOB, "org_id": ORG_A, "customer_id": "cust-1", "estimated_total_cents": 5000},
        ), patch(
            "app.routes.stripe.get_customer_by_id",
            return_value={"id": "cust-1", "org_id": ORG_A, "stripe_customer_id": "cus_x"},
        ):
            with self.assertRaises(HTTPException) as ctx:
                _call(_valid_body(expected_amount_cents=1))
        self.assertEqual(ctx.exception.status_code, 409)
        self._assert_stripe_untouched()

    def test_job_with_no_payable_amount_is_rejected(self):
        with patch("app.routes.stripe.get_payment_status_id_by_key", return_value="status-uuid"), patch(
            "app.routes.stripe.get_job_by_id",
            return_value={"id": JOB, "org_id": ORG_A, "customer_id": "cust-1", "estimated_total_cents": 0},
        ), patch(
            "app.routes.stripe.get_customer_by_id",
            return_value={"id": "cust-1", "org_id": ORG_A, "stripe_customer_id": "cus_x"},
        ):
            with self.assertRaises(HTTPException) as ctx:
                _call(_valid_body())
        self.assertEqual(ctx.exception.status_code, 409)
        self._assert_stripe_untouched()


class TestGuardOrdering(unittest.TestCase):
    def test_authenticates_before_any_stripe_initialisation(self):
        # Ordering is the security property: if Stripe init moved above the auth
        # check, an unauthenticated request would reach the provider.
        import app.routes.stripe as stripe_routes

        with open(stripe_routes.__file__, "r", encoding="utf-8") as fh:
            source = fh.read()
        start = source.index('@router.post("/admin/payments/run")')
        body = source[start : source.index("@router.post", start + 10)]
        self.assertLess(
            body.index("require_payment_executor_auth"),
            body.index("stripe.api_key = STRIPE_SECRET_KEY"),
        )


if __name__ == "__main__":
    unittest.main()
