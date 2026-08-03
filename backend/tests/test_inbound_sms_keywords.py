"""
Phase 0 commit 3 — SMS compliance keyword handling (STOP / START / HELP).

Behavioral: every test invokes the real handler and inspects what was actually
persisted. Preference writes are captured through a fake transport, so the
assertions are about behavior, not source shape.

Covers the required matrix: STOP, START, HELP, repeated STOP, repeated START,
STOP->START, START->STOP, queued message after STOP, queued after START,
unknown keyword, malformed payload.
"""

import os
import unittest
from typing import Any, Dict, List
from unittest.mock import patch

os.environ.setdefault("STRIPE_SECRET_KEY", "unit_test_stripe_secret_placeholder")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "unit_test_stripe_webhook_placeholder")

from app.services.inbound_keyword_handler import handle_inbound_keyword, resolve_person_id  # noqa: E402
from app.services.sms_keywords import (  # noqa: E402
    AFFECTED_CATEGORIES,
    build_preference_changes,
    keyword_response,
    parse_sms_keyword,
)

ORG = "aaaaaaaa-0000-4000-8000-000000000001"
PERSON = "11111111-0000-4000-8000-000000000001"


def resolved_message(**over) -> Dict[str, Any]:
    row = {
        "id": "msg-1",
        "metadata": {
            "primary_entity_type": "persons",
            "primary_entity_id": PERSON,
            "inbound_resolution": "single_person_match",
        },
    }
    row.update(over)
    return row


def unresolved_message() -> Dict[str, Any]:
    return {
        "id": "msg-2",
        "metadata": {
            "primary_entity_type": "communications_unknown",
            "inbound_resolution": "unknown_sender",
        },
    }


class KeywordHarness:
    """Captures preference writes instead of hitting Supabase."""

    def __init__(self, initial: Dict[str, str] | None = None, persist_ok: bool = True):
        self.states: Dict[str, str] = dict(initial or {})
        self.applied: List[List[Dict[str, Any]]] = []
        self.persist_ok = persist_ok

    def load(self, org_id, person_id, categories):  # noqa: ARG002
        return dict(self.states)

    def apply(self, changes):
        if not self.persist_ok:
            return False
        self.applied.append(changes)
        for c in changes:
            self.states[c["category"]] = c["to_state"]
        return True

    @property
    def events(self) -> List[Dict[str, Any]]:
        return [c for batch in self.applied for c in batch]


def run_keyword(harness: KeywordHarness, body, message_row=None):
    with patch(
        "app.services.inbound_keyword_handler.load_current_states", side_effect=harness.load
    ), patch("app.services.inbound_keyword_handler.apply_preference_changes", side_effect=harness.apply):
        return handle_inbound_keyword(
            org_id=ORG,
            body=body,
            message_row=message_row if message_row is not None else resolved_message(),
        )


class TestParsing(unittest.TestCase):
    def test_recognises_each_keyword_family(self):
        for token in ("STOP", "stopall", "Unsubscribe", "CANCEL", "quit", "optout", "opt-out"):
            self.assertEqual(parse_sms_keyword(token), "stop", token)
        for token in ("START", "unstop", "optin", "opt-in"):
            self.assertEqual(parse_sms_keyword(token), "start", token)
        for token in ("HELP", "info"):
            self.assertEqual(parse_sms_keyword(token), "help", token)

    def test_only_the_first_token_counts(self):
        # "stop by tomorrow at 3" is a sentence, not an opt-out.
        self.assertIsNone(parse_sms_keyword("please stop by tomorrow"))
        self.assertEqual(parse_sms_keyword("stop please"), "stop")

    def test_yes_is_not_a_resubscribe_keyword(self):
        # Removed deliberately: "Yes" answers ordinary questions and is not a
        # carrier-standard START keyword.
        self.assertIsNone(parse_sms_keyword("yes"))

    def test_malformed_payloads_do_not_raise(self):
        for body in (None, "", "   ", "\n\t", 12345, {"not": "a string"}):
            self.assertIsNone(parse_sms_keyword(body))  # type: ignore[arg-type]


class TestStopStartHelp(unittest.TestCase):
    def test_stop_opts_out_of_every_sms_category(self):
        h = KeywordHarness()
        result = run_keyword(h, "STOP")

        self.assertTrue(result["applied"])
        self.assertEqual(result["keyword"], "stop")
        self.assertEqual({c["category"] for c in h.events}, set(AFFECTED_CATEGORIES))
        self.assertTrue(all(c["to_state"] == "opted_out" for c in h.events))

    def test_stop_covers_operational_not_just_marketing(self):
        # The bulk of what the platform sends is operational. A STOP that only
        # blocked marketing would be worthless.
        h = KeywordHarness()
        run_keyword(h, "STOP")
        self.assertIn("sms_operational", {c["category"] for c in h.events})

    def test_start_opts_back_in(self):
        h = KeywordHarness({c: "opted_out" for c in AFFECTED_CATEGORIES})
        result = run_keyword(h, "START")

        self.assertTrue(result["applied"])
        self.assertTrue(all(c["to_state"] == "opted_in" for c in h.events))

    def test_help_changes_nothing(self):
        h = KeywordHarness()
        result = run_keyword(h, "HELP")

        self.assertFalse(result["applied"])
        self.assertEqual(result["reason"], "informational_only")
        self.assertEqual(h.applied, [])
        self.assertIsNotNone(result["response"])

    def test_help_returns_compliant_informational_text(self):
        response = keyword_response("help")
        self.assertIn("STOP", response)


class TestHistoryIsPreserved(unittest.TestCase):
    def test_start_appends_an_event_and_never_erases_the_prior_stop(self):
        h = KeywordHarness()
        run_keyword(h, "STOP")
        run_keyword(h, "START")

        stop_events = [c for c in h.events if c["to_state"] == "opted_out"]
        start_events = [c for c in h.events if c["to_state"] == "opted_in"]

        self.assertEqual(len(stop_events), len(AFFECTED_CATEGORIES))
        self.assertEqual(len(start_events), len(AFFECTED_CATEGORIES))
        # The START events record the transition truthfully.
        self.assertTrue(all(c["from_state"] == "opted_out" for c in start_events))

    def test_start_then_stop_records_both_transitions(self):
        h = KeywordHarness()
        run_keyword(h, "START")
        run_keyword(h, "STOP")

        self.assertEqual(len(h.applied), 2)
        final = [c for c in h.applied[-1]]
        self.assertTrue(all(c["from_state"] == "opted_in" for c in final))
        self.assertTrue(all(c["to_state"] == "opted_out" for c in final))

    def test_repeated_stop_is_recorded_not_silently_dropped(self):
        h = KeywordHarness()
        run_keyword(h, "STOP")
        run_keyword(h, "STOP")

        self.assertEqual(len(h.applied), 2, "a second STOP must still be audited")
        second = h.applied[1]
        self.assertTrue(all(c["from_state"] == "opted_out" for c in second))
        self.assertTrue(all(c["to_state"] == "opted_out" for c in second))

    def test_repeated_start_is_recorded(self):
        h = KeywordHarness()
        run_keyword(h, "START")
        run_keyword(h, "START")
        self.assertEqual(len(h.applied), 2)

    def test_every_change_carries_source_and_method_for_audit(self):
        h = KeywordHarness()
        run_keyword(h, "STOP")
        for c in h.events:
            self.assertEqual(c["source"], "sms_keyword")
            self.assertEqual(c["method"], "stop")


class TestScope(unittest.TestCase):
    def test_preferences_apply_to_the_person_only(self):
        h = KeywordHarness()
        run_keyword(h, "STOP")
        self.assertTrue(all(c["person_id"] == PERSON for c in h.events))
        self.assertTrue(all(c["org_id"] == ORG for c in h.events))

    def test_unresolved_sender_is_recorded_but_not_applied(self):
        # An unresolved inbound anchors to a synthetic entity, not a person.
        # Writing preferences for it would attach consent to nobody, or worse,
        # to the wrong party.
        h = KeywordHarness()
        result = run_keyword(h, "STOP", message_row=unresolved_message())

        self.assertFalse(result["applied"])
        self.assertEqual(result["reason"], "sender_unresolved")
        self.assertEqual(h.applied, [])

    def test_resolve_person_id_rejects_the_unknown_anchor(self):
        self.assertIsNone(resolve_person_id(unresolved_message()))
        self.assertEqual(resolve_person_id(resolved_message()), PERSON)

    def test_persist_failure_is_reported_as_unhonored(self):
        # A failed write must never be reported as an applied opt-out.
        h = KeywordHarness(persist_ok=False)
        result = run_keyword(h, "STOP")
        self.assertFalse(result["applied"])
        self.assertEqual(result["reason"], "persist_failed")


class TestNonKeywords(unittest.TestCase):
    def test_unknown_keyword_changes_nothing(self):
        h = KeywordHarness()
        result = run_keyword(h, "when is pickup?")

        self.assertIsNone(result["keyword"])
        self.assertFalse(result["applied"])
        self.assertEqual(h.applied, [])

    def test_malformed_payload_degrades_rather_than_raising(self):
        for body in (None, "", "   "):
            h = KeywordHarness()
            result = run_keyword(h, body)
            self.assertFalse(result["applied"])
            self.assertEqual(h.applied, [])


class TestQueuedMessageInteraction(unittest.TestCase):
    """
    STOP must affect messages that are queued-but-unsent. Enforcement happens at
    dispatch (commit 4); here we prove the STATE those checks will read is
    written immediately and completely.
    """

    def test_stop_leaves_every_sms_category_opted_out_for_a_later_dispatch_check(self):
        h = KeywordHarness()
        run_keyword(h, "STOP")
        for category in AFFECTED_CATEGORIES:
            self.assertEqual(h.states[category], "opted_out", category)

    def test_start_leaves_every_sms_category_opted_in_for_a_later_dispatch_check(self):
        h = KeywordHarness({c: "opted_out" for c in AFFECTED_CATEGORIES})
        run_keyword(h, "START")
        for category in AFFECTED_CATEGORIES:
            self.assertEqual(h.states[category], "opted_in", category)


class TestCrossRuntimeParity(unittest.TestCase):
    def test_python_and_typescript_load_the_same_contract(self):
        import json
        import app.services.sms_keywords as mod

        with open(mod._CONTRACT_PATH, "r", encoding="utf-8") as fh:
            contract = json.load(fh)

        # Derive the repo root from the contract path the module already
        # resolves, rather than counting dirname() levels independently.
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(mod._CONTRACT_PATH)))
        ts_path = os.path.join(repo_root, "web", "lib", "communications", "v2", "smsKeywords.ts")
        with open(ts_path, "r", encoding="utf-8") as fh:
            ts = fh.read()

        for keyword, tokens in contract["keywords"].items():
            for token in tokens:
                self.assertIn(f'"{token}"', ts, f"{keyword} token {token} missing from the TypeScript set")
        for category in contract["affected_preference_categories"]:
            self.assertIn(f'"{category}"', ts, f"{category} missing from SMS_KEYWORD_CATEGORIES")


class TestChangeBuilder(unittest.TestCase):
    def test_help_produces_no_changes(self):
        self.assertEqual(build_preference_changes(org_id=ORG, person_id=PERSON, keyword="help"), [])

    def test_one_change_per_affected_category(self):
        changes = build_preference_changes(org_id=ORG, person_id=PERSON, keyword="stop")
        self.assertEqual(len(changes), len(AFFECTED_CATEGORIES))


if __name__ == "__main__":
    unittest.main()
