"""
A multi-turn exchange must remain one thread in the parent's mail client.

`References` is what clients group on, so it must GROW across turns — replacing
it splits a long conversation on their side even though Alloy still sees one.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.communications.email_thread_headers import (  # noqa: E402
    MAX_REFERENCES,
    build_references_chain,
    outbound_email_headers,
)

A = "<alloy.aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa@s.example>"
B = "<parent-b@mail.example>"
C = "<alloy.cccccccc-3333-4333-8333-cccccccccccc@s.example>"
D = "<parent-d@mail.example>"


class TestReferencesChain:
    def test_first_outbound_has_no_chain(self):
        assert build_references_chain([], None) is None

    def test_reply_to_an_inbound_names_it_last(self):
        # Clients read the final entry as the immediate parent.
        assert build_references_chain([A], B).endswith(B)

    def test_chain_grows_across_a_multi_turn_exchange(self):
        # Alloy A -> parent B -> Alloy C -> parent D -> Alloy E
        after_c = build_references_chain([A], B)
        after_e = build_references_chain([A, B, C], D)
        assert after_c.split() == [A, B]
        assert after_e.split() == [A, B, C, D]
        # Growing, never replaced.
        assert after_e.startswith(after_c)

    def test_deduplicates_while_preserving_order(self):
        assert build_references_chain([A, A, B], B).split() == [A, B]

    def test_caps_a_runaway_chain_keeping_both_ends(self):
        many = [f"<m{i}@x.example>" for i in range(60)]
        got = build_references_chain(many, D).split()
        assert len(got) == MAX_REFERENCES
        # The root and the immediate ancestor are what threading relies on.
        assert got[0] == many[0]
        assert got[-1] == D


class TestHeaderAssembly:
    def test_omits_what_is_absent_rather_than_sending_empties(self):
        assert outbound_email_headers(message_id=None, in_reply_to=None, references=None) == {}

    def test_includes_only_what_exists(self):
        got = outbound_email_headers(message_id=A, in_reply_to=B, references=f"{A} {B}")
        assert got == {"Message-ID": A, "In-Reply-To": B, "References": f"{A} {B}"}

    def test_a_first_outbound_carries_only_its_own_id(self):
        assert outbound_email_headers(message_id=A, in_reply_to=None, references=None) == {"Message-ID": A}
