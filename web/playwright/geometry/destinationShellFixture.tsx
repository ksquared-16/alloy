/**
 * THE FIXTURE THE PHASE 0 DESTINATION-SHELL GATE MOUNTS (P0-7.1).
 *
 * It renders the REAL `AlloyOperationalBootShell` — the component the surface host actually paints
 * during the whole pre-commit window — with the REAL runtime stylesheet. Nothing here reimplements
 * the shell; the fixture only chooses which destination facts are known, which is the axis under
 * test.
 *
 * The three cases are the three states the surface host can be in:
 *
 *   `none`      no destination known — the shell as it behaved before this slice
 *   `workUnit`  the route named a work unit (the ordinary cold Work Unit entry)
 *   `withSubject` the queue-preview seed also knew the subject (row-click entry)
 *
 * `window.__shell` is the whole contract with the spec.
 */

import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

type Case = "none" | "workUnit" | "withSubject";

const DESTINATIONS: Record<Case, undefined | { workUnitSlug?: string | null; workViewId?: string | null; subjectLabel?: string | null }> = {
    none: undefined,
    workUnit: { workUnitSlug: "waitlist", workViewId: "new_leads" },
    withSubject: { workUnitSlug: "new-leads", workViewId: "new_leads", subjectLabel: "Wrigley Kurzman" },
};

function Fixture() {
    const [which, setWhich] = useState<Case>("workUnit");
    const apply = useCallback((c: Case) => setWhich(c), []);
    useEffect(() => {
        (window as unknown as { __shell: unknown }).__shell = { apply };
    }, [apply]);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "600px", width: "1200px" }}>
            <AlloyOperationalBootShell variant="work_unit" chrome="content" destination={DESTINATIONS[which]} />
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
