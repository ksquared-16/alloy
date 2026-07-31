"""
Phase 0 commit 7 — legacy SMS containment (S-1).

Behavioral. The provider is a recording fake, so "unauthorized requests never
reach Twilio/GHL" is asserted directly rather than inferred.

NO LIVE SMS is possible: the fake has no network access, and every refusal
happens before a send.
"""

import os
import unittest

os.environ.setdefault("STRIPE_SECRET_KEY", "unit_test_stripe_secret_placeholder")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "unit_test_stripe_webhook_placeholder")

from app import settings as app_settings  # noqa: E402
from app.services.legacy_dispatch_guard import (  # noqa: E402
    ALLOWED_PURPOSES,
    DispatchGuardError,
    MAX_CODE_ATTEMPTS,
    build_assignment_confirmation,
    check_lockout,
    claim_idempotency,
    clear_attempts,
    enforce_rate_limit,
    record_failed_attempt,
    require_workflow_secret,
    reset_state_for_tests,
    send_bounded_sms,
)

SECRET = "test-ghl-workflow-secret"
CONTACT = "contact-abc123"


class Sender:
    """Recording provider double."""

    def __init__(self, fail: bool = False):
        self.calls = []
        self.fail = fail

    def __call__(self, contact_id, body):
        if self.fail:
            raise RuntimeError("provider down")
        self.calls.append((contact_id, body))


class Base(unittest.TestCase):
    def setUp(self):
        reset_state_for_tests()
        app_settings.GHL_WORKFLOW_SECRET = SECRET


class TestAuthentication(Base):
    def test_missing_secret_fails(self):
        with self.assertRaises(DispatchGuardError) as ctx:
            require_workflow_secret(None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_invalid_secret_fails(self):
        with self.assertRaises(DispatchGuardError) as ctx:
            require_workflow_secret("wrong")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_unconfigured_server_fails_closed(self):
        app_settings.GHL_WORKFLOW_SECRET = ""
        with self.assertRaises(DispatchGuardError) as ctx:
            require_workflow_secret(SECRET)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_valid_secret_passes(self):
        require_workflow_secret(SECRET)  # must not raise

    def test_uses_constant_time_comparison(self):
        import app.services.legacy_dispatch_guard as mod

        with open(mod.__file__, "r", encoding="utf-8") as fh:
            self.assertIn("hmac.compare_digest", fh.read())

    def test_response_is_generic_and_never_echoes_the_candidate(self):
        with self.assertRaises(DispatchGuardError) as ctx:
            require_workflow_secret("super-secret-guess")
        self.assertEqual(ctx.exception.detail, "Unauthorized")
        self.assertNotIn("super-secret-guess", ctx.exception.detail)


class TestGuessingProtection(Base):
    def test_locks_out_after_repeated_failures(self):
        key = f"offer:{CONTACT}"
        for _ in range(MAX_CODE_ATTEMPTS):
            record_failed_attempt(key)

        with self.assertRaises(DispatchGuardError) as ctx:
            check_lockout(key)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_below_the_threshold_is_not_locked_out(self):
        key = f"offer:{CONTACT}"
        for _ in range(MAX_CODE_ATTEMPTS - 1):
            record_failed_attempt(key)
        check_lockout(key)  # must not raise

    def test_success_clears_attempts(self):
        key = f"offer:{CONTACT}"
        for _ in range(MAX_CODE_ATTEMPTS - 1):
            record_failed_attempt(key)
        clear_attempts(key)
        record_failed_attempt(key)
        check_lockout(key)  # must not raise

    def test_rate_limit_engages(self):
        with self.assertRaises(DispatchGuardError) as ctx:
            for _ in range(500):
                enforce_rate_limit("/contractor-reply:global")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_five_digit_code_is_not_treated_as_sufficient_authorization(self):
        # The containment position: the code gates acceptance, never disclosure.
        msg = build_assignment_confirmation(
            start_time_display="Mon 9:00", customer_name="Dana R", has_access_details=True
        )
        self.assertNotIn("Access notes", msg)
        self.assertNotIn("Entry:", msg)


class TestIdempotency(Base):
    def test_first_claim_succeeds_and_replay_does_not(self):
        self.assertTrue(claim_idempotency("accept:offer-1"))
        self.assertFalse(claim_idempotency("accept:offer-1"))

    def test_distinct_operations_are_independent(self):
        self.assertTrue(claim_idempotency("accept:offer-1"))
        self.assertTrue(claim_idempotency("accept:offer-2"))


class TestSensitiveDataMinimisation(Base):
    def test_confirmation_omits_every_home_access_secret(self):
        msg = build_assignment_confirmation(
            start_time_display="Mon 9:00", customer_name="Dana R", has_access_details=True
        )
        for forbidden in ("Address", "Entry", "Access notes", "lockbox", "alarm", "door code", "Customer phone"):
            self.assertNotIn(forbidden.lower(), msg.lower(), forbidden)

    def test_confirmation_retains_the_minimum_assignment_information(self):
        msg = build_assignment_confirmation(
            start_time_display="Mon 9:00", customer_name="Dana R", has_access_details=False
        )
        self.assertIn("Mon 9:00", msg)
        self.assertIn("Dana R", msg)

    def test_states_the_limitation_rather_than_disclosing_anyway(self):
        msg = build_assignment_confirmation(
            start_time_display="Mon 9:00", customer_name="Dana R", has_access_details=True
        )
        self.assertIn("not sent by text", msg)

    def test_route_source_contains_no_access_disclosure_in_any_sms(self):
        import app.routes.dispatch as d

        with open(d.__file__, "r", encoding="utf-8") as fh:
            src = fh.read()
        self.assertNotIn('confirm_msg += f"Entry:', src)
        self.assertNotIn('confirm_msg += f"Access notes:', src)
        self.assertNotIn('confirm_msg += f"Address:', src)


class TestBoundedSend(Base):
    def test_sends_once_for_an_allowed_purpose(self):
        sender = Sender()
        ok = send_bounded_sms(contact_id=CONTACT, body="hello", purpose="assignment_confirmation", sender=sender)
        self.assertTrue(ok)
        self.assertEqual(len(sender.calls), 1)

    def test_rejects_an_unknown_purpose(self):
        sender = Sender()
        with self.assertRaises(DispatchGuardError):
            send_bounded_sms(contact_id=CONTACT, body="hello", purpose="anything_i_want", sender=sender)
        self.assertEqual(sender.calls, [])

    def test_rejects_a_missing_destination(self):
        sender = Sender()
        with self.assertRaises(DispatchGuardError):
            send_bounded_sms(contact_id="", body="hello", purpose="job_offer", sender=sender)
        self.assertEqual(sender.calls, [])

    def test_purpose_vocabulary_is_closed(self):
        self.assertEqual(
            sorted(ALLOWED_PURPOSES),
            sorted(["job_offer", "assignment_confirmation", "assignment_claimed", "customer_assignment_notice"]),
        )

    def test_provider_failure_is_reported_not_raised(self):
        ok = send_bounded_sms(
            contact_id=CONTACT, body="hello", purpose="job_offer", sender=Sender(fail=True)
        )
        self.assertFalse(ok)


class TestRejectionBranchesSendNothing(Base):
    def test_no_rejection_branch_send_remains_in_the_route(self):
        # Six of nine send sites fired on rejection branches, before any
        # validation had succeeded — an unauthenticated SMS oracle.
        import app.routes.dispatch as d

        with open(d.__file__, "r", encoding="utf-8") as fh:
            src = fh.read()

        for gone in (
            "send_conversation_sms(contact_id, rejection_msg)",
            'send_conversation_sms(contact_id, "Error processing your acceptance. Please contact support.")',
            'send_conversation_sms(contact_id, "This offer has expired. Please wait for a new job offer.")',
            'send_conversation_sms(contact_id, "Contractor not found. Please contact support.")',
            'send_conversation_sms(contact_id, "You are not eligible for this job. Please contact support.")',
        ):
            self.assertNotIn(gone, src)

    def test_authentication_precedes_every_send_site(self):
        import app.routes.dispatch as d

        with open(d.__file__, "r", encoding="utf-8") as fh:
            src = fh.read()

        first_auth = src.index("require_workflow_secret(x_alloy_workflow_secret)")
        first_send = src.index("send_bounded_sms(")
        self.assertLess(first_auth, first_send, "auth must precede any provider call")

    def test_every_send_goes_through_the_bounded_helper(self):
        # The provider function may appear ONLY as the injected `sender=`.
        # A direct call would be an unbounded send path.
        import re

        import app.routes.dispatch as d

        with open(d.__file__, "r", encoding="utf-8") as fh:
            src = fh.read()

        direct = [
            m.group(0)
            for m in re.finditer(r"send_conversation_sms\s*\(", src)
        ]
        self.assertEqual(direct, [], f"direct provider calls remain: {direct}")

    def test_both_routes_require_the_workflow_secret(self):
        import app.routes.dispatch as d

        with open(d.__file__, "r", encoding="utf-8") as fh:
            src = fh.read()

        self.assertEqual(src.count("require_workflow_secret(x_alloy_workflow_secret)"), 2)
        self.assertEqual(src.count("x_alloy_workflow_secret: Optional[str] = Header("), 2)


class TestReplayAndLockoutWiring(Base):
    """The helpers exist; these assert the ROUTE actually calls them."""

    def _src(self):
        import app.routes.dispatch as d

        with open(d.__file__, "r", encoding="utf-8") as fh:
            return fh.read()

    def test_lockout_is_checked_before_the_code_is_evaluated(self):
        src = self._src()
        self.assertLess(src.index("check_lockout(attempt_key)"), src.index("if not offer_code:"))

    def test_failed_code_attempts_are_counted(self):
        self.assertGreaterEqual(self._src().count("record_failed_attempt(attempt_key)"), 3)

    def test_idempotency_is_claimed_before_any_state_mutation(self):
        src = self._src()
        self.assertLess(
            src.index("claim_idempotency("),
            src.index("upsert_job_assignment_to_ghl("),
            "a replay must be suppressed before the job is reassigned",
        )

    def test_attempts_are_cleared_only_after_the_code_is_proven(self):
        src = self._src()
        self.assertLess(src.index("if not offer_code:"), src.index("clear_attempts(attempt_key)"))


class TestAudit(Base):
    def test_audit_excludes_secrets_and_access_content(self):
        import logging

        import app.services.legacy_dispatch_guard as mod

        records = []

        class Cap(logging.Handler):
            def emit(self, record):
                records.append(record.getMessage())

        handler = Cap()
        mod.logger.addHandler(handler)
        try:
            mod.audit(
                "test_event",
                contact_id="contact-abcdef",
                secret=SECRET,
                access_notes="lockbox 4821",
                access_method="key under mat",
                message="full body here",
            )
        finally:
            mod.logger.removeHandler(handler)

        blob = " ".join(records)
        self.assertNotIn(SECRET, blob)
        self.assertNotIn("lockbox", blob)
        self.assertNotIn("key under mat", blob)
        self.assertNotIn("full body here", blob)
        # Identifiers are masked rather than printed in full.
        self.assertNotIn("contact-abcdef", blob)


if __name__ == "__main__":
    unittest.main()
