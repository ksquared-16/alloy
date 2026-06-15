"""P3.1 — per-message Twilio statusCallback URL builder."""
from app.services.communications.status_callback import build_sms_status_callback_url


def test_no_base_returns_none():
    assert build_sms_status_callback_url("", "bind-1") is None
    assert build_sms_status_callback_url(None, "bind-1") is None


def test_base_with_binding():
    assert (
        build_sms_status_callback_url("https://app.example.com", "bind-1")
        == "https://app.example.com/api/webhooks/twilio/sms-status/bind-1"
    )


def test_trailing_slash_normalized():
    assert (
        build_sms_status_callback_url("https://app.example.com/", "bind-1")
        == "https://app.example.com/api/webhooks/twilio/sms-status/bind-1"
    )


def test_base_without_binding():
    assert (
        build_sms_status_callback_url("https://app.example.com", None)
        == "https://app.example.com/api/webhooks/twilio/sms-status"
    )
    assert (
        build_sms_status_callback_url("https://app.example.com", "  ")
        == "https://app.example.com/api/webhooks/twilio/sms-status"
    )
