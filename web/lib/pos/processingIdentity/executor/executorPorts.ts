/**
 * Production executor ports (D2).
 *
 *  - atomicGroup → `execute_processing_identity_group` RPC (one DB transaction)
 *  - command     → the D0 registry over canonical helpers
 *  - compensation→ flags created records for the operator (hard-delete prohibited)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneForPersonWrite } from "@/lib/identity";
import { executeIdentityCommand } from "../commands/registry";
import { IDENTITY_COMMAND_KEYS } from "../commands/commandKeys";
import { createDefaultIdentityCommandPorts } from "../commands/ports";
import type {
    AtomicGroupRunner,
    CommandExecutor,
    CompensationPort,
    ExecutorPorts,
} from "./executorTypes";

/**
 * E2E-16 — THE ATOMIC GROUP IS A PERSON WRITER TOO.
 *
 * `create_person` is atomic, so Processing never reaches the command registry's find-or-create port
 * for it: the payload goes straight to `execute_processing_identity_group`, whose `INSERT INTO
 * persons` stores `phone` exactly as given. Create Lead's payload carries the phone as typed, so BOS
 * "555-555-0153" was stored raw (measured on deployed 50affaee, and reproduced against the RPC on the
 * shared stack) while Add Person — through the find-or-create port — stored E.164.
 *
 * This is the one TS boundary every atomic identity write crosses, so the canonical write form is
 * applied here with the same helper the other person write ports use. The command key is checked so
 * no other command's payload is touched.
 */
export function canonicalAtomicIdentityPayload(commandKey: string, payload: Record<string, unknown>): Record<string, unknown> {
    if (commandKey !== IDENTITY_COMMAND_KEYS.createPerson || !("phone" in payload)) return payload;
    return { ...payload, phone: normalizePhoneForPersonWrite(payload.phone as string | null | undefined) };
}

export function createAtomicGroupRunner(supabase: SupabaseClient): AtomicGroupRunner {
    return {
        async run(input) {
            const { data, error } = await supabase.rpc("execute_processing_identity_group", {
                p_org_id: input.orgId,
                p_actor: input.actorId,
                p_idempotency_key: input.idempotencyKey,
                p_operations: input.operations.map((op) => ({
                    op_id: op.opId,
                    command_key: op.commandKey,
                    payload: canonicalAtomicIdentityPayload(op.commandKey, op.payload),
                })),
            });
            if (error) return { ok: false, error: error.message };
            const payload = (data ?? {}) as { ok?: boolean; refs?: Record<string, string>; error?: string };
            if (!payload.ok) return { ok: false, error: payload.error ?? "atomic_group_failed", refs: payload.refs };
            return { ok: true, refs: payload.refs ?? {} };
        },
    };
}

export function createCommandExecutor(supabase: SupabaseClient): CommandExecutor {
    const ports = createDefaultIdentityCommandPorts();
    return {
        async execute(commandKey, payload, opts) {
            return executeIdentityCommand(commandKey, payload, {
                supabase,
                orgId: opts.orgId,
                actorId: opts.actorId,
                idempotencyKey: opts.idempotencyKey,
                ports,
            });
        },
    };
}

/**
 * Default compensation: created identity records are never hard-deleted; they are
 * flagged for operator review. Reversible links could be undone in a later phase.
 */
export function createCompensationPort(): CompensationPort {
    return {
        async compensate(input) {
            return {
                opId: input.op.opId,
                action: "flagged_for_operator",
                status: "recorded",
                detail: `${input.op.commandKey} (${input.op.targetType}) flagged for operator; not auto-deleted`,
            };
        },
    };
}

export function createExecutorPorts(supabase: SupabaseClient): ExecutorPorts {
    return {
        atomicGroup: createAtomicGroupRunner(supabase),
        command: createCommandExecutor(supabase),
        compensation: createCompensationPort(),
    };
}
