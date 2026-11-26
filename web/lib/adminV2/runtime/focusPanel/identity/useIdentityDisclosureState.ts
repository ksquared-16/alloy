"use client";

import { useCallback, useState } from "react";
import {
    INITIAL_IDENTITY_DISCLOSURE_STATE,
    transitionIdentityDisclosure,
    type IdentityDisclosureState,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

export function useIdentityDisclosureState(initial: IdentityDisclosureState = INITIAL_IDENTITY_DISCLOSURE_STATE) {
    const [state, setState] = useState(initial);

    const enterContext = useCallback((sectionKey?: string) => {
        setState((current) =>
            transitionIdentityDisclosure(current, { type: "enter_context", sectionKey }),
        );
    }, []);

    const selectIdentity = useCallback((identityId: string, sectionKey?: string) => {
        setState((current) =>
            transitionIdentityDisclosure(current, { type: "select_identity", identityId, sectionKey }),
        );
    }, []);

    const enterEvidence = useCallback((identityId: string, sectionKey?: string) => {
        setState((current) =>
            transitionIdentityDisclosure(current, { type: "enter_evidence", identityId, sectionKey }),
        );
    }, []);

    const back = useCallback(() => {
        setState((current) => transitionIdentityDisclosure(current, { type: "back" }));
    }, []);

    /*
     * Reset to the state this card OPENED in, not to the collection root.
     *
     * On a case panel those are the same thing, which is why the constant was inlined here. On a
     * host whose subject IS one identity — a durable child record — opening at the collection root
     * is not a reset, it is a different card: the operator is returned to a roster of one that they
     * never navigated into. `initial` already carries the right answer for both hosts.
     */
    const reset = useCallback(() => {
        setState(initial);
    }, [initial]);

    return {
        state,
        setState,
        enterContext,
        selectIdentity,
        enterEvidence,
        back,
        reset,
    };
}
