"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Immediate acknowledgement for command-rail action buttons (Workspace + Work Unit).
 *
 * The instant an action is invoked its key becomes `pending` — the button shows a working state and
 * is disabled, so the operator sees their click registered and cannot double-fire the same action
 * while its (often slow) work is in flight. Presentation only: this does NOT change what an action
 * does or how it refreshes — correctness is untouched. Shared so both right-rail surfaces acknowledge
 * identically (one implementation, not two).
 */
export function useCommandRailActionPending(): {
    pendingKey: string | null;
    runWithPending: (key: string, run: () => Promise<unknown> | void) => void;
} {
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runWithPending = useCallback((key: string, run: () => Promise<unknown> | void) => {
        setPendingKey(key);
        void Promise.resolve(run()).finally(() => {
            // Only clear if this key is still the pending one — a newer action supersedes.
            if (mountedRef.current) setPendingKey((current) => (current === key ? null : current));
        });
    }, []);

    return { pendingKey, runWithPending };
}
