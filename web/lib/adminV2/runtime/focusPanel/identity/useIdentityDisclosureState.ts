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

    const reset = useCallback(() => {
        setState(INITIAL_IDENTITY_DISCLOSURE_STATE);
    }, []);

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
