/**
 * Command Runtime Facade invariants (P1.S1).
 * Fail loudly in development/test when a snapshot contradicts the Capability Registry.
 */

import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type { CommandSnapshot } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

function isStrictEnv(): boolean {
    return process.env.NODE_ENV !== "production";
}

export function assertCommandSnapshotInvariants(
    snapshot: CommandSnapshot,
    capability: PlatformCapabilityDefinition | null
): void {
    const errors: string[] = [];

    if (capability) {
        if (snapshot.canonicalCapabilityKey !== capability.canonicalCommandKey) {
            errors.push(
                `canonical mismatch: snapshot=${snapshot.canonicalCapabilityKey} capability=${capability.canonicalCommandKey}`
            );
        }
        if (snapshot.executionOwner !== capability.executionOwner) {
            errors.push(
                `executionOwner mismatch: snapshot=${snapshot.executionOwner} capability=${capability.executionOwner}`
            );
        }
        if (snapshot.executionDestination.owner !== capability.executionOwner) {
            errors.push("executionDestination.owner must match capability.executionOwner");
        }
        if (snapshot.maturity !== capability.maturity) {
            errors.push(`maturity mismatch: snapshot=${snapshot.maturity} capability=${capability.maturity}`);
        }
        if (snapshot.catalogVisibility !== capability.catalogVisibility) {
            errors.push("catalogVisibility mismatch");
        }
        if (snapshot.confirmationPolicy !== capability.confirmationPolicy) {
            errors.push("confirmationPolicy mismatch");
        }
    }

    if (
        (snapshot.maturity === "unavailable" || snapshot.maturity === "placeholder") &&
        (snapshot.nextLifecycleStage === "preview" ||
            snapshot.nextLifecycleStage === "confirm" ||
            snapshot.nextLifecycleStage === "execute")
    ) {
        errors.push("unavailable/placeholder cannot advance to preview/confirm/execute");
    }

    if (snapshot.maturity === "navigation_only" && snapshot.executionDestination.executableViaFacadeLater) {
        errors.push("navigation_only cannot claim facade-executable mutation");
    }

    if (
        snapshot.maturity === "processing_only" &&
        snapshot.catalogVisibility === "organization_command_catalog"
    ) {
        errors.push("processing_only cannot be organization_command_catalog");
    }

    if (snapshot.runnable === false && snapshot.nextLifecycleStage === "execute") {
        errors.push("non-runnable snapshot cannot next=execute");
    }

    if (snapshot.authorizationEvaluated !== false || snapshot.authorizationGranted !== null) {
        errors.push("P1.S1 must not claim authorization evaluation");
    }

    // Operator-safe projection must not embed diagnostic codes.
    for (const d of snapshot.diagnostics) {
        if (snapshot.operatorSafe.statusMessage.includes(d.code)) {
            errors.push(`operatorSafe leaked diagnostic code ${d.code}`);
        }
    }

    if (errors.length === 0) return;
    const message = `[commandRuntime] invariant failures:\n- ${errors.join("\n- ")}`;
    if (isStrictEnv()) throw new Error(message);
    console.warn(message);
}
