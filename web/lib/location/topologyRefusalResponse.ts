/**
 * One transport shape for a topology refusal.
 *
 * A refusal carries a NAMED code as well as the sentence, because the Type and
 * Inside controls that come later have to explain why a change cannot be made,
 * and they must not do it by pattern-matching English or — worse — by surfacing
 * a Postgres exception. `error` keeps the existing Alloy admin-API grammar (a
 * plain string every current client already reads); `code` is additive.
 */

import { NextResponse } from "next/server";
import type { TopologyRefusalCode, TopologyVerdict } from "@/lib/location/topologyMutationAuthority";

export type TopologyRefusalBody = {
    error: string;
    code: TopologyRefusalCode;
};

/** 400 for every topology refusal: the request is well-formed but not legal. */
export function topologyRefusalResponse(verdict: TopologyVerdict): NextResponse {
    if (verdict.ok) {
        throw new Error("topologyRefusalResponse called with an accepting verdict");
    }
    return NextResponse.json<TopologyRefusalBody>(
        { error: verdict.message, code: verdict.code },
        { status: 400 }
    );
}
