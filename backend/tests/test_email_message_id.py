"""
Correlation evidence Alloy authors itself.

These cover the header contract that makes `In-Reply-To` threading possible at
all. They are provider-independent on purpose: whichever provider Alloy uses to
receive mail, this is the evidence it will match on.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.communications.email_message_id import (  # noqa: E402
    correlation_candidates,
    domain_of,
    mint_outbound_message_id,
    parse_alloy_message_id,
    parse_reference_message_ids,
)

MSG = "11111111-2222-4333-8444-555555555555"
OTHER = "99999999-8888-4777-8666-555555555555"


class TestMint:
    def test_mints_from_the_canonical_message_id(self):
        got = mint_outbound_message_id(communication_message_id=MSG, from_email="hello@school.example")
        assert got == f"<alloy.{MSG}@school.example>"

    def test_uses_the_sending_domain_not_the_local_part(self):
        got = mint_outbound_message_id(communication_message_id=MSG, from_email="Front Desk <desk@a.example>")
        assert got.endswith("@a.example>")

    def test_refuses_rather_than_inventing_when_the_id_is_not_a_uuid(self):
        # A header that looks authoritative and correlates to nothing is worse
        # than no header.
        assert mint_outbound_message_id(communication_message_id="not-a-uuid", from_email="a@b.example") is None
        assert mint_outbound_message_id(communication_message_id="", from_email="a@b.example") is None

    def test_refuses_when_the_sender_has_no_domain(self):
        assert mint_outbound_message_id(communication_message_id=MSG, from_email="nodomain") is None
        assert mint_outbound_message_id(communication_message_id=MSG, from_email="") is None

    def test_round_trips(self):
        minted = mint_outbound_message_id(communication_message_id=MSG, from_email="a@b.example")
        assert parse_alloy_message_id(minted) == MSG


class TestParse:
    def test_reads_our_own_id_back(self):
        assert parse_alloy_message_id(f"<alloy.{MSG}@school.example>") == MSG

    def test_tolerates_surrounding_whitespace(self):
        assert parse_alloy_message_id(f"  <alloy.{MSG}@school.example>  ") == MSG

    def test_ignores_another_system_s_message_id(self):
        assert parse_alloy_message_id("<CAF=abc123@mail.gmail.com>") is None

    def test_ignores_our_prefix_wrapped_around_a_non_uuid(self):
        # Shape is checked, so a plausible-looking forgery does not become a key.
        assert parse_alloy_message_id("<alloy.hello@school.example>") is None
        assert parse_alloy_message_id("<alloy.../etc/passwd@school.example>") is None

    def test_refuses_a_forged_id_from_another_domain(self):
        # Six characters then a real UUID. Slicing the prefix LENGTH off blindly
        # would yield a valid-looking message id and hand an attacker a lookup
        # key; the `alloy.` prefix check is what refuses it.
        assert parse_alloy_message_id(f"<xxxxxx{MSG}@attacker.example>") is None
        assert parse_alloy_message_id(f"<notus.{MSG}@attacker.example>") is None

    def test_ignores_malformed_and_missing_headers(self):
        assert parse_alloy_message_id(None) is None
        assert parse_alloy_message_id("") is None
        assert parse_alloy_message_id("no angle brackets") is None
        assert parse_alloy_message_id("<unterminated") is None


class TestReferences:
    def test_returns_our_ids_in_chain_order(self):
        header = f"<x@foreign.example> <alloy.{OTHER}@s.example> <alloy.{MSG}@s.example>"
        assert parse_reference_message_ids(header) == [OTHER, MSG]

    def test_skips_foreign_ids_rather_than_failing(self):
        # A thread that passed through another system is still ours to correlate.
        header = f"<a@gmail.com> <b@outlook.com> <alloy.{MSG}@s.example>"
        assert parse_reference_message_ids(header) == [MSG]

    def test_deduplicates(self):
        header = f"<alloy.{MSG}@s.example> <alloy.{MSG}@s.example>"
        assert parse_reference_message_ids(header) == [MSG]

    def test_empty_when_nothing_is_ours(self):
        assert parse_reference_message_ids("<a@gmail.com>") == []
        assert parse_reference_message_ids(None) == []


class TestCorrelationOrder:
    def test_in_reply_to_outranks_references(self):
        # In-Reply-To names the single message being answered.
        got = correlation_candidates(
            in_reply_to=f"<alloy.{MSG}@s.example>",
            references=f"<alloy.{OTHER}@s.example>",
        )
        assert got[0] == MSG

    def test_falls_back_to_the_most_recent_reference(self):
        # References is oldest-first, so the LAST of ours is the nearest ancestor.
        got = correlation_candidates(
            in_reply_to=None,
            references=f"<alloy.{OTHER}@s.example> <alloy.{MSG}@s.example>",
        )
        assert got[0] == MSG
        assert got[1] == OTHER

    def test_no_candidates_when_no_threading_evidence_is_ours(self):
        # The caller must then fall back to weaker evidence — deliberately not
        # decided here, and never subject text.
        assert correlation_candidates(in_reply_to=None, references=None) == []
        assert correlation_candidates(in_reply_to="<x@gmail.com>", references="<y@gmail.com>") == []

    def test_does_not_duplicate_when_both_headers_name_the_same_message(self):
        got = correlation_candidates(
            in_reply_to=f"<alloy.{MSG}@s.example>",
            references=f"<alloy.{MSG}@s.example>",
        )
        assert got == [MSG]


class TestDomain:
    def test_extracts_domain(self):
        assert domain_of("a@b.example") == "b.example"
        assert domain_of("A@B.Example") == "b.example"

    def test_none_without_a_domain(self):
        assert domain_of("nodomain") is None
        assert domain_of("") is None


class TestOutboundSendCarriesTheHeader:
    """The header must reach the provider payload, not just exist as a helper."""

    def test_resend_payload_includes_the_minted_message_id(self, monkeypatch):
        import app.integrations.resend_client as rc

        captured = {}

        class _Resp:
            ok = True
            text = '{"id":"resend-123"}'

            @staticmethod
            def json():
                return {"id": "resend-123"}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured["payload"] = json
            return _Resp()

        monkeypatch.setattr(rc.requests, "post", fake_post)

        rc.send_resend_email(
            to_email="parent@example.invalid",
            subject="Tour",
            html_body=None,
            text_body="Hello",
            from_email="desk@school.example",
            api_key="key",
            message_id=f"<alloy.{MSG}@school.example>",
        )

        assert captured["payload"]["headers"]["Message-ID"] == f"<alloy.{MSG}@school.example>"

    def test_no_header_is_sent_when_none_could_be_minted(self, monkeypatch):
        import app.integrations.resend_client as rc

        captured = {}

        class _Resp:
            ok = True
            text = "{}"

            @staticmethod
            def json():
                return {}

        monkeypatch.setattr(
            rc.requests, "post", lambda url, json=None, headers=None, timeout=None: (captured.update(payload=json), _Resp())[1]
        )

        rc.send_resend_email(
            to_email="parent@example.invalid",
            subject="Tour",
            html_body=None,
            text_body="Hello",
            from_email="desk@school.example",
            api_key="key",
            message_id=None,
        )

        assert "headers" not in captured["payload"]
