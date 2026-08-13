"""
Guard: Alloy must never send the STOP / START / HELP acknowledgement.

Twilio owns it. Outbound SMS goes through a Twilio Messaging Service, which
answers these keywords at the provider layer — carrier-mandated for US A2P and
not declinable. If Alloy sent one too, a parent who just texted STOP would get two
messages, one from the system they just told to stop.

`keyword_response()` exists for record and operator display only. This test fails
the build if any send path starts consuming it, because the natural instinct on
seeing "computes copy that is never sent" is to wire it up — and that instinct is
wrong here.
"""

from __future__ import annotations

import pathlib
import re

BACKEND = pathlib.Path(__file__).resolve().parents[1]

#: Modules that legitimately reference the copy: the contract loader that defines
#: it, the inbound handler that RECORDS it, and this test.
ALLOWED = {
    "app/services/sms_keywords.py",
    "app/services/inbound_keyword_handler.py",
}

#: Anything that looks like handing text to a provider or a queue.
SEND_MARKERS = re.compile(
    r"(send_sms|send_message|messages\.create|twilio_client|send_resend_email|"
    r"enqueue|communication_messages.*insert|dispatch)",
    re.IGNORECASE,
)


def _python_sources():
    for path in (BACKEND / "app").rglob("*.py"):
        if "__pycache__" in str(path):
            continue
        yield path


def test_keyword_response_is_never_handed_to_a_send_path():
    offenders = []
    for path in _python_sources():
        rel = str(path.relative_to(BACKEND))
        if rel in ALLOWED:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "keyword_response" in text:
            offenders.append(rel)
    assert not offenders, (
        "keyword_response() must not be used outside the contract loader and the "
        "inbound handler that records it — Twilio owns the acknowledgement. "
        f"Found in: {offenders}"
    )


def test_the_inbound_handler_records_but_does_not_send():
    handler = (BACKEND / "app/services/inbound_keyword_handler.py").read_text(encoding="utf-8")
    for line in handler.splitlines():
        if "keyword_response" not in line:
            continue
        # Every use must be a value placed into the returned record, never an
        # argument to something that transmits.
        assert not SEND_MARKERS.search(line), (
            f"keyword_response() reached a send path: {line.strip()}"
        )
