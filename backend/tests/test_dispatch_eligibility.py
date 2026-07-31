"""
Phase 0 commit 4 — dispatch-time policy revalidation.

Behavioral: every test calls the real `revalidate_for_dispatch` and asserts the
decision. Supabase reads are replaced by fakes, so the assertions are about
behavior at the provider boundary rather than source shape.

NO PROVIDER IS EVER CALLED. This module tests the layer that runs BEFORE the
provider; the sender integration test asserts the provider is not reached.
"""

import os
import unittest
from datetime import datetime, timezone
from typing import Any, Dict
from unittest.mock import patch

os.environ.setdefault("STRIPE_SECRET_KEY", "unit_test_stripe_secret_placeholder")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "unit_test_stripe_webhook_placeholder")

from app.services.dispatch_eligibility import (  # noqa: E402
    CONTRACT,
    evaluate_quiet_hours,
    preference_category_for,
    revalidate_for_dispatch,
    validate_snapshot,
)

def _repo_root() -> str:
    """
    Derive the repo root from the contract path the module already resolves,
    rather than counting dirname() levels independently — that miscount has
    bitten these parity tests twice.
    """
    import app.services.dispatch_eligibility as mod

    return os.path.dirname(os.path.dirname(os.path.dirname(mod._CONTRACT_PATH)))


ORG = "aaaaaaaa-0000-4000-8000-000000000001"
OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000002"
PERSON = "11111111-0000-4000-8000-000000000001"
IDENTITY = "22222222-0000-4000-8000-000000000001"

INSIDE_QUIET = datetime(2026, 8, 2, 6, 30, tzinfo=timezone.utc)   # 23:30 America/Los_Angeles
OUTSIDE_QUIET = datetime(2026, 8, 1, 19, 0, tzinfo=timezone.utc)  # 12:00 America/Los_Angeles

QUIET_WINDOW = {"start": "21:00", "end": "08:00", "timezone": "America/Los_Angeles", "basis": "location"}


def snapshot(**over) -> Dict[str, Any]:
    snap = {
        "snapshotVersion": 1,
        "policyVersion": "2026-07-31.1",
        "decision": {"allowed": True, "code": None, "reason": "Eligible."},
        "audience": "external",
        "category": "operational",
        "purpose": "tour_reminder",
        "recipient": {"personId": PERSON, "channel": "sms"},
        "authorizedBy": {"userId": "u1", "permission": "communications.send"},
        "identity": {"identityId": None, "providerAccountId": None, "bindingId": None},
        "consentInputs": [],
        "quietHours": None,
        "evaluatedAt": "2026-07-31T00:00:00Z",
    }
    snap.update(over)
    return snap


def message(**over) -> Dict[str, Any]:
    row = {
        "id": "msg-1",
        "org_id": ORG,
        "channel": "sms",
        "direction": "outbound",
        "status": "queued",
        "to_address": "+15555550123",
        "eligibility_snapshot": snapshot(),
    }
    row.update(over)
    return row


class Fakes:
    """Live-state doubles. Defaults are the permissive case."""

    def __init__(self, *, pref="unset", pref_failed=False, suppressed=False, supp_failed=False, identity=None,
                 identity_failed=False):
        self.pref = pref
        self.pref_failed = pref_failed
        self.suppressed = suppressed
        self.supp_failed = supp_failed
        self.identity = identity
        self.identity_failed = identity_failed

    def __enter__(self):
        self._patches = [
            patch("app.services.dispatch_eligibility.load_preference_state",
                  side_effect=lambda *a, **k: (self.pref, self.pref_failed)),
            patch("app.services.dispatch_eligibility.is_suppressed",
                  side_effect=lambda *a, **k: (self.suppressed, self.supp_failed)),
            patch("app.services.dispatch_eligibility.load_identity",
                  side_effect=lambda *a, **k: (self.identity, self.identity_failed)),
        ]
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in self._patches:
            p.stop()
        return False


def decide(row=None, *, now=OUTSIDE_QUIET, **fake_kwargs):
    with Fakes(**fake_kwargs):
        return revalidate_for_dispatch(row if row is not None else message(), now=now)


class TestValidDispatch(unittest.TestCase):
    def test_eligible_sms_dispatches(self):
        self.assertEqual(decide().outcome, "send_now")

    def test_eligible_email_dispatches(self):
        row = message(channel="email", to_address="p@example.invalid",
                      eligibility_snapshot=snapshot(recipient={"personId": PERSON, "channel": "email"}))
        self.assertEqual(decide(row).outcome, "send_now")


class TestSnapshotIntegrity(unittest.TestCase):
    def test_missing_snapshot_fails_closed(self):
        d = decide(message(eligibility_snapshot=None))
        self.assertEqual(d.outcome, "blocked")
        self.assertEqual(d.reason, "SNAPSHOT_MISSING")

    def test_malformed_snapshot_fails_closed(self):
        for bad in ("{not json", 42, ["a"], ""):
            d = decide(message(eligibility_snapshot=bad))
            self.assertEqual(d.outcome, "blocked", bad)
            self.assertIn(d.reason, ("SNAPSHOT_MALFORMED", "SNAPSHOT_MISSING"))

    def test_unknown_snapshot_version_fails_closed(self):
        d = decide(message(eligibility_snapshot=snapshot(snapshotVersion=99)))
        self.assertEqual(d.reason, "SNAPSHOT_VERSION_UNSUPPORTED")

    def test_missing_required_field_fails_closed(self):
        snap = snapshot()
        del snap["authorizedBy"]
        self.assertEqual(decide(message(eligibility_snapshot=snap)).reason, "STRUCTURAL_INVALID")

    def test_missing_category_fails_closed_and_is_never_inferred(self):
        snap = snapshot()
        snap["category"] = None
        d = decide(message(eligibility_snapshot=snap))
        self.assertEqual(d.reason, "CATEGORY_MISSING")
        self.assertNotEqual(d.outcome, "send_now")

    def test_invalid_category_fails_closed(self):
        self.assertEqual(decide(message(eligibility_snapshot=snapshot(category="promo"))).reason, "CATEGORY_INVALID")

    def test_json_string_snapshot_is_accepted(self):
        import json
        row = message(eligibility_snapshot=json.dumps(snapshot()))
        self.assertEqual(decide(row).outcome, "send_now")


class TestPreferences(unittest.TestCase):
    def test_stop_after_enqueue_blocks_dispatch(self):
        # The message was eligible at enqueue; a STOP arrived while it sat queued.
        d = decide(pref="opted_out")
        self.assertEqual(d.outcome, "blocked")
        self.assertEqual(d.reason, "OPTED_OUT")

    def test_start_after_stop_restores_eligibility(self):
        self.assertEqual(decide(pref="opted_in").outcome, "send_now")

    def test_marketing_requires_opt_in(self):
        row = message(eligibility_snapshot=snapshot(category="marketing"))
        self.assertEqual(decide(row, pref="unset").reason, "MARKETING_REQUIRES_OPT_IN")
        self.assertEqual(decide(row, pref="opted_out").reason, "OPTED_OUT")
        self.assertEqual(decide(row, pref="opted_in").outcome, "send_now")

    def test_operational_opt_out_blocks_operational(self):
        self.assertEqual(decide(pref="opted_out").reason, "OPTED_OUT")

    def test_transactional_is_not_suppressed_by_opt_out(self):
        row = message(eligibility_snapshot=snapshot(category="transactional"))
        self.assertEqual(decide(row, pref="opted_out").outcome, "send_now")

    def test_emergency_is_not_suppressed_by_opt_out(self):
        row = message(eligibility_snapshot=snapshot(category="emergency"))
        self.assertEqual(decide(row, pref="opted_out").outcome, "send_now")

    def test_unresolved_person_fails_closed_where_consent_is_required(self):
        snap = snapshot(recipient={"personId": None, "channel": "sms"})
        self.assertEqual(decide(message(eligibility_snapshot=snap)).reason, "RECIPIENT_UNRESOLVED")

    def test_preference_lookup_failure_fails_closed(self):
        # A database hiccup must never become permission to send.
        self.assertEqual(decide(pref_failed=True).outcome, "blocked")

    def test_preference_scope_is_person_not_household(self):
        captured = {}

        def fake_pref(org_id, person_id, pref_category):
            captured["person_id"] = person_id
            return "unset", False

        with patch("app.services.dispatch_eligibility.load_preference_state", side_effect=fake_pref), patch(
            "app.services.dispatch_eligibility.is_suppressed", return_value=(False, False)
        ), patch("app.services.dispatch_eligibility.load_identity", return_value=(None, False)):
            revalidate_for_dispatch(message(), now=OUTSIDE_QUIET)

        self.assertEqual(captured["person_id"], PERSON)


class TestSuppression(unittest.TestCase):
    def test_hard_bounced_destination_is_blocked(self):
        self.assertEqual(decide(suppressed=True).reason, "SUPPRESSED")

    def test_complained_destination_is_blocked(self):
        # Both hard bounce and complaint map to the same suppression outcome.
        self.assertEqual(decide(suppressed=True).outcome, "blocked")

    def test_only_bounce_and_complaint_suppress(self):
        # A transient failure is a retry concern, not a consent concern.
        self.assertEqual(sorted(CONTRACT["suppressing_delivery_events"]), ["bounced", "complaint"])

    def test_emergency_overrides_suppression(self):
        row = message(eligibility_snapshot=snapshot(category="emergency"))
        self.assertEqual(decide(row, suppressed=True).outcome, "send_now")

    def test_suppression_lookup_failure_fails_closed(self):
        self.assertEqual(decide(supp_failed=True).outcome, "blocked")


class TestIdentity(unittest.TestCase):
    def _row(self):
        return message(eligibility_snapshot=snapshot(
            identity={"identityId": IDENTITY, "providerAccountId": None, "bindingId": None}
        ))

    def test_missing_identity_is_blocked(self):
        self.assertEqual(decide(self._row(), identity=None).reason, "IDENTITY_MISSING")

    def test_disabled_identity_is_blocked(self):
        ident = {"id": IDENTITY, "org_id": ORG, "status": "disabled", "channel": "sms", "outbound_enabled": True}
        self.assertEqual(decide(self._row(), identity=ident).reason, "IDENTITY_DISABLED")

    def test_outbound_disabled_identity_is_blocked(self):
        ident = {"id": IDENTITY, "org_id": ORG, "status": "active", "channel": "sms", "outbound_enabled": False}
        self.assertEqual(decide(self._row(), identity=ident).reason, "IDENTITY_DISABLED")

    def test_cross_org_identity_is_blocked(self):
        ident = {"id": IDENTITY, "org_id": OTHER_ORG, "status": "active", "channel": "sms", "outbound_enabled": True}
        self.assertEqual(decide(self._row(), identity=ident).reason, "IDENTITY_WRONG_ORG")

    def test_unsupported_channel_is_blocked(self):
        ident = {"id": IDENTITY, "org_id": ORG, "status": "active", "channel": "email", "outbound_enabled": True}
        self.assertEqual(decide(self._row(), identity=ident).reason, "IDENTITY_CHANNEL_UNSUPPORTED")

    def test_valid_identity_dispatches(self):
        ident = {"id": IDENTITY, "org_id": ORG, "status": "active", "channel": "sms", "outbound_enabled": True}
        self.assertEqual(decide(self._row(), identity=ident).outcome, "send_now")

    def test_identity_lookup_failure_fails_closed(self):
        self.assertEqual(decide(self._row(), identity_failed=True).outcome, "blocked")


class TestQuietHours(unittest.TestCase):
    def _row(self, category="operational"):
        return message(eligibility_snapshot=snapshot(category=category, quietHours=QUIET_WINDOW))

    def test_defers_with_a_deterministic_next_attempt(self):
        d = decide(self._row(), now=INSIDE_QUIET)
        self.assertEqual(d.outcome, "defer_until")
        self.assertEqual(d.reason, "QUIET_HOURS")
        self.assertIsNotNone(d.defer_until)
        # Deferral must not be permanent failure.
        self.assertNotEqual(d.outcome, "blocked")

    def test_next_attempt_is_the_end_of_the_window(self):
        _, next_attempt = evaluate_quiet_hours(QUIET_WINDOW, INSIDE_QUIET)
        self.assertIsNotNone(next_attempt)
        self.assertGreater(next_attempt, INSIDE_QUIET)

    def test_outside_the_window_dispatches(self):
        self.assertEqual(decide(self._row(), now=OUTSIDE_QUIET).outcome, "send_now")

    def test_transactional_and_emergency_are_exempt(self):
        for category in ("transactional", "emergency"):
            self.assertEqual(decide(self._row(category), now=INSIDE_QUIET).outcome, "send_now", category)

    def test_emergency_exemption_is_explicit_in_the_contract(self):
        # Emergency must be a declared exemption, not an accident of ordering.
        self.assertIn("emergency", CONTRACT["quiet_hours_exempt_categories"])

    def test_unevaluable_window_fails_closed(self):
        bad = dict(QUIET_WINDOW, timezone="Not/AZone")
        row = message(eligibility_snapshot=snapshot(quietHours=bad))
        self.assertEqual(decide(row, now=INSIDE_QUIET).outcome, "blocked")


class TestAudience(unittest.TestCase):
    def test_internal_on_a_provider_channel_is_blocked(self):
        row = message(channel="email", eligibility_snapshot=snapshot(audience="internal"))
        self.assertEqual(decide(row).reason, "INTERNAL_TO_PROVIDER")

    def test_internal_in_app_is_not_subject_to_external_consent(self):
        row = message(channel="in_app", eligibility_snapshot=snapshot(audience="internal"))
        self.assertEqual(decide(row, pref="opted_out").outcome, "send_now")

    def test_invalid_audience_fails_closed(self):
        self.assertEqual(decide(message(eligibility_snapshot=snapshot(audience="everyone"))).reason, "AUDIENCE_INVALID")


class TestDeterminismAndIdempotence(unittest.TestCase):
    def test_reasons_come_from_the_shared_contract(self):
        seen = set()
        for row, kwargs in [
            (message(eligibility_snapshot=None), {}),
            (message(), {"pref": "opted_out"}),
            (message(), {"suppressed": True}),
        ]:
            seen.add(decide(row, **kwargs).reason)
        for reason in seen:
            self.assertIn(reason, CONTRACT["block_reasons"])

    def test_repeating_a_blocked_evaluation_is_stable(self):
        first = decide(pref="opted_out")
        second = decide(pref="opted_out")
        self.assertEqual((first.outcome, first.reason), (second.outcome, second.reason))

    def test_audit_payload_is_machine_readable_and_operator_safe(self):
        d = decide(pref="opted_out")
        audit = d.to_audit()
        self.assertEqual(audit["outcome"], "blocked")
        self.assertEqual(audit["reason"], "OPTED_OUT")
        self.assertTrue(audit["operator_message"])
        self.assertTrue(audit["evaluated_at"])


class TestCrossRuntimeParity(unittest.TestCase):
    def test_preference_mapping_matches_the_shared_contract(self):
        # Drives the real mapping function through the contract table. Both
        # runtimes build these keys programmatically, so string-matching the
        # other implementation's source would be brittle and meaningless.
        for category, per_channel in CONTRACT["preference_mapping"].items():
            for channel, expected in per_channel.items():
                self.assertEqual(
                    preference_category_for(category, channel),
                    expected,
                    f"{category}/{channel}",
                )

    def test_snapshot_required_fields_match_the_typescript_type(self):
        ts_path = os.path.join(_repo_root(), "web", "lib", "communications", "eligibility", "types.ts")
        with open(ts_path, "r", encoding="utf-8") as fh:
            ts = fh.read()
        for field in CONTRACT["snapshot_required_fields"]:
            self.assertIn(field, ts, f"{field} missing from EligibilitySnapshot")

    def test_lifecycle_states_distinguish_policy_from_provider_failure(self):
        states = CONTRACT["lifecycle_states"]
        self.assertIn("blocked", states)
        self.assertIn("deferred", states)
        self.assertIn("failed", states)
        self.assertIn("TRANSPORT", states["failed"])


class TestSnapshotValidatorDirect(unittest.TestCase):
    def test_returns_snapshot_when_valid(self):
        snap, block = validate_snapshot(snapshot())
        self.assertIsNone(block)
        self.assertIsNotNone(snap)


if __name__ == "__main__":
    unittest.main()
