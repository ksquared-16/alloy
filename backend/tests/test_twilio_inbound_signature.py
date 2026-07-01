"""Unit tests for Twilio inbound signature helpers (Card 24)."""

import os
import unittest

# settings.py requires Stripe env at import time
os.environ.setdefault("STRIPE_SECRET_KEY", "unit_test_stripe_secret_placeholder")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "unit_test_stripe_webhook_placeholder")
from unittest.mock import patch

from twilio.request_validator import RequestValidator

from app.services.twilio_inbound_signature import (
    form_to_signature_params,
    resolve_inbound_twilio_auth_token,
    validate_twilio_inbound_signature,
)


class TestTwilioInboundSignature(unittest.TestCase):
    def test_validate_accepts_official_signature(self) -> None:
        token = "test_auth_token_12345"
        url = "https://api.example.com/sms/inbound"
        params = {"From": "+1000", "To": "+2000", "Body": "hello", "MessageSid": "SMabc"}
        sig = RequestValidator(token).compute_signature(url, params)
        self.assertTrue(
            validate_twilio_inbound_signature(
                auth_token=token,
                full_url=url,
                post_params=params,
                signature_header=sig,
            )
        )

    def test_validate_rejects_wrong_token(self) -> None:
        token = "good_token"
        url = "https://api.example.com/sms/inbound"
        params = {"Body": "x"}
        sig = RequestValidator(token).compute_signature(url, params)
        self.assertFalse(
            validate_twilio_inbound_signature(
                auth_token="other_token",
                full_url=url,
                post_params=params,
                signature_header=sig,
            )
        )

    def test_validate_rejects_tampered_params(self) -> None:
        token = "t"
        url = "https://x/sms/inbound"
        params = {"Body": "a"}
        sig = RequestValidator(token).compute_signature(url, params)
        self.assertFalse(
            validate_twilio_inbound_signature(
                auth_token=token,
                full_url=url,
                post_params={**params, "Body": "b"},
                signature_header=sig,
            )
        )

    def test_validate_requires_header(self) -> None:
        self.assertFalse(
            validate_twilio_inbound_signature(
                auth_token="x",
                full_url="https://y/",
                post_params={},
                signature_header=None,
            )
        )

    @patch("app.services.twilio_inbound_signature.TWILIO_AUTH_TOKEN", "globaltok")
    def test_resolve_global_when_no_binding(self) -> None:
        self.assertEqual(resolve_inbound_twilio_auth_token(None), "globaltok")

    @patch("app.services.twilio_inbound_signature.TWILIO_AUTH_TOKEN", "globaltok")
    def test_resolve_legacy_global_sentinel(self) -> None:
        self.assertEqual(
            resolve_inbound_twilio_auth_token({"secret_ref": "legacy_global_twilio"}),
            "globaltok",
        )


class TestFormToParams(unittest.TestCase):
    def test_form_to_signature_params_multi_items(self) -> None:
        class FakeForm:
            def multi_items(self):
                return [("A", "1"), ("B", "two")]

        d = form_to_signature_params(FakeForm())
        self.assertEqual(d, {"A": "1", "B": "two"})


if __name__ == "__main__":
    unittest.main()
