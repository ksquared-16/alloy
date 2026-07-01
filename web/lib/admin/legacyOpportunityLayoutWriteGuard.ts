/**
 * API guard — block legacy record_drawer_layouts writes when visual layout config is active.
 */

import { NextResponse } from "next/server";
import {
    isLegacyOpportunityDrawerLayoutWriteBlockedServer,
    LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_CODE,
    LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_MESSAGE,
} from "@/lib/layout/legacyOpportunityDrawerLayoutConvergence";

export function legacyOpportunityLayoutWriteBlockedResponse(): NextResponse {
    return NextResponse.json(
        {
            error: LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_MESSAGE,
            code: LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_CODE,
        },
        { status: 409 },
    );
}

export function assertLegacyOpportunityLayoutWriteAllowed():
    | { ok: true }
    | { ok: false; response: NextResponse } {
    if (isLegacyOpportunityDrawerLayoutWriteBlockedServer()) {
        return { ok: false, response: legacyOpportunityLayoutWriteBlockedResponse() };
    }
    return { ok: true };
}
