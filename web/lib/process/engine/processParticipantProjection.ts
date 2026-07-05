/**
 * Process Engine — the Projection port.
 *
 * The engine defines this interface; each Business Process IMPLEMENTS it in its own Definition
 * folder, doing its own joins. The engine never queries a process's tables — it only consumes the
 * ProcessParticipant[] a projection returns. This is what keeps the engine process-agnostic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessParticipant } from "./processParticipant";
import type { ProcessParticipationContract } from "./processParticipationContract";

/** Read scope: org, optionally narrowed to one scope key (work unit / location / …). */
export type ProcessParticipantScope = {
    orgId: string;
    scopeId?: string | null;
};

/** A process's participant adapter: its contract + a loader that produces the canonical shape. */
export interface ProcessParticipantProjection<Attr = Record<string, never>> {
    readonly contract: ProcessParticipationContract;
    load(supabase: SupabaseClient, scope: ProcessParticipantScope): Promise<ProcessParticipant<Attr>[]>;
}
