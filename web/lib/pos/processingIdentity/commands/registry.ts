/**
 * Registered Identity Command registry (D0).
 *
 * The registry is the ONLY server-side entry point for executing a semantic
 * identity command. It enforces the safety boundary before any handler runs:
 *  - unknown / forbidden (physical) keys are rejected;
 *  - a stable operation idempotency key is required;
 *  - previews never mutate;
 *  - commands not executable in V1 (propose_merge) cannot be executed.
 */

import {
    type CommandContext,
    type CommandMetadata,
    type CommandPreview,
    type CommandResult,
    type ProcessingIdentityCommand,
    type ValidationResult,
} from "./commandContracts";
import { isForbiddenCommandKey } from "./commandKeys";
import { IDENTITY_COMMANDS } from "./handlers";

export class CommandRegistryError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = "CommandRegistryError";
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getIdentityCommand(key: string): ProcessingIdentityCommand<any, any> | null {
    if (isForbiddenCommandKey(key)) return null;
    return IDENTITY_COMMANDS[key] ?? null;
}

export function registeredIdentityCommandKeys(): string[] {
    return Object.keys(IDENTITY_COMMANDS);
}

export function getCommandMetadata(key: string): CommandMetadata | null {
    return getIdentityCommand(key)?.metadata ?? null;
}

export function isSupportedIdentityCommand(key: string): boolean {
    return getIdentityCommand(key) !== null;
}

/** Resolve a command or throw a typed registry error (raw/unknown keys rejected). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveOrThrow(key: string): ProcessingIdentityCommand<any, any> {
    if (isForbiddenCommandKey(key)) {
        throw new CommandRegistryError("forbidden_command_key", `Command key "${key}" targets physical storage and is not permitted`);
    }
    const cmd = IDENTITY_COMMANDS[key];
    if (!cmd) {
        throw new CommandRegistryError("unknown_command", `No registered identity command for key "${key}"`);
    }
    return cmd;
}

function assertIdempotencyKey(context: CommandContext): void {
    if (!context.idempotencyKey || !context.idempotencyKey.trim()) {
        throw new CommandRegistryError("missing_idempotency_key", "A stable operation idempotency key is required");
    }
}

export async function validateIdentityCommand(
    key: string,
    input: unknown,
    context: CommandContext,
): Promise<ValidationResult> {
    const cmd = resolveOrThrow(key);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return cmd.validate(input as any, context);
}

/** Preview is side-effect free. It never touches a write path. */
export async function previewIdentityCommand(
    key: string,
    input: unknown,
    context: CommandContext,
): Promise<CommandPreview> {
    const cmd = resolveOrThrow(key);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return cmd.preview(input as any, context);
}

/**
 * Execute a registered command. Validation runs first; execution is refused if
 * the command is not executable in V1 (merge) or validation fails.
 */
export async function executeIdentityCommand<TResult = Record<string, unknown>>(
    key: string,
    input: unknown,
    context: CommandContext,
): Promise<CommandResult<TResult>> {
    const cmd = resolveOrThrow(key);
    assertIdempotencyKey(context);

    if (!cmd.metadata.executableInV1) {
        return {
            ok: false,
            refs: [],
            result: {} as TResult,
            idempotentReplay: false,
            error: `command_not_executable_in_v1:${key}`,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validation = await cmd.validate(input as any, context);
    if (!validation.ok) {
        const first = validation.issues.find((i) => i.severity === "error");
        return {
            ok: false,
            refs: [],
            result: {} as TResult,
            idempotentReplay: false,
            error: first ? `${first.code}: ${first.message}` : "validation_failed",
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return cmd.execute(input as any, context) as Promise<CommandResult<TResult>>;
}
