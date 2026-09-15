/**
 * THE FIVE COMMUNICATIONS AUTHORITIES, AND THE ONE GATE THAT READS THEM.
 *
 * Communications had two capability keys and five materially different powers. The census that
 * preceded this module found 29 of 32 mutations carrying no functional authority at all, and proved
 * the consequence: a principal holding only `portal.access` reached provider configuration, template
 * creation, announcement creation and channel bindings. Those routes call `requireAdminOrOps()`,
 * which despite its name resolves nothing but portal admission.
 *
 * So this is deliberately shaped like {@link requireAccessAdministration}: one function, one
 * capability argument, one refusal that names the key it wanted. A route asks for the authority its
 * own operation needs and gets a 403 otherwise.
 *
 * **It reads capabilities and nothing else.** The older send check opened with
 * `roleKeys.some(r => r === "admin" || r === "ops")`, which is the fifth authority layer `W-13`
 * removed from the rest of the platform: a role KEY, stored in no grant table, satisfying an
 * authority check on its own. Every organization's `admin` and `ops` hold these keys through
 * `seed_default_rbac`, so reading the grant rather than the name costs that population nothing and
 * makes a custom role behave identically to a seeded one with the same package — which is the whole
 * point of configurable roles.
 */
import { NextResponse } from "next/server";

import {
    getAdminAccessContextCached,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";

/** Organization communication truth: conversations, messages, history. */
export const COMMUNICATIONS_READ = "communications.read" as const;
/** Ordinary individual send — one person, one message, through a sanctioned channel. */
export const COMMUNICATIONS_SEND = "communications.send" as const;
/** Authoring and lifecycle of organization templates. Confers no ability to deliver. */
export const COMMUNICATIONS_TEMPLATES_MANAGE = "communications.templates.manage" as const;
/** Delivery services and channel bindings. Selects credential REFERENCES; never reads secrets. */
export const COMMUNICATIONS_PROVIDER_CONFIGURE = "communications.provider.configure" as const;
/** Organization-wide, announcement and campaign sends, whose blast radius is materially larger. */
export const COMMUNICATIONS_BULK_SEND = "communications.bulk.send" as const;

export type CommunicationsCapability =
    | typeof COMMUNICATIONS_READ
    | typeof COMMUNICATIONS_SEND
    | typeof COMMUNICATIONS_TEMPLATES_MANAGE
    | typeof COMMUNICATIONS_PROVIDER_CONFIGURE
    | typeof COMMUNICATIONS_BULK_SEND;

export type CommunicationsAuth =
    | { ok: true; access: AdminAccessContextSuccess }
    | { ok: false; response: NextResponse };

/**
 * Admit a request holding exactly the capability its operation needs.
 *
 * The refusal names the key so an operator debugging a denial can see which authority they lack
 * rather than being told only that they are forbidden — the same contract the Access routes give.
 */
export async function requireCommunicationsAuthority(
    capability: CommunicationsCapability,
): Promise<CommunicationsAuth> {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: access.status === 401 ? "Unauthorized" : "Forbidden" },
                { status: access.status },
            ),
        };
    }
    if (!access.permissionKeys.includes(capability)) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Forbidden", required_permission: capability },
                { status: 403 },
            ),
        };
    }
    return { ok: true, access };
}

/**
 * NON-IMPLICATION IS THE MODEL, and it is stated here so it can be asserted.
 *
 * None of these five implies another. A sender may not rewrite the organization's templates; a
 * template author may not deliver what they wrote; a provider administrator may not message a
 * family; a bulk sender does not thereby configure delivery. Composition is done with GRANTS, by
 * giving a role more than one key — never with implication hidden in the backend, which would make
 * the role editor's distinctions a fiction.
 */
export const COMMUNICATIONS_CAPABILITIES: readonly CommunicationsCapability[] = Object.freeze([
    COMMUNICATIONS_READ,
    COMMUNICATIONS_SEND,
    COMMUNICATIONS_TEMPLATES_MANAGE,
    COMMUNICATIONS_PROVIDER_CONFIGURE,
    COMMUNICATIONS_BULK_SEND,
]);
