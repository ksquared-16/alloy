import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveOutboundSenderMock = vi.fn();

vi.mock("@/lib/communications/identity/resolveOutboundSender", () => ({
    resolveOutboundSender: (...args: unknown[]) => resolveOutboundSenderMock(...args),
}));

vi.mock("@/lib/communications/canonicalOutboundEnqueue", () => ({
    enqueueCanonicalOutboundMessage: vi.fn(async () => ({
        communicationMessageId: "msg-1",
        threadId: "thread-1",
    })),
}));

vi.mock("@/lib/communications/mirrorObservation", () => ({
    logCommDualWrite: vi.fn(),
    orgIdTail: (x: string) => x.slice(-4),
}));

vi.mock("@/lib/communications/identity/identityResolutionObservability", () => ({
    logCanonicalResolution: vi.fn(),
    logIdentityResolution: vi.fn(),
    logResolutionFailure: vi.fn(),
}));

vi.mock("@/lib/communications/resolvePrimaryEntity", () => ({
    resolvePrimaryEntityFromWorkflowPayload: () => ({ entityType: "opportunities", entityId: "ent-1" }),
    resolveContextLocationId: () => "loc-1",
}));

import { enqueueCanonicalCommunicationMirror } from "@/lib/communications/mirrorQueuedMessage";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";

describe("enqueueCanonicalCommunicationMirror", () => {
    beforeEach(() => {
        resolveOutboundSenderMock.mockReset();
    });

    it("resolves identity before enqueue when resolution succeeds", async () => {
        resolveOutboundSenderMock.mockResolvedValue({
            ok: true,
            communicationIdentity: { id: "ident-1" },
            providerAccount: { id: "acct-1" },
            legacyBindingId: "bind-1",
            selectionReason: "location_default",
            fallbackLevel: 10,
            safeSenderMetadata: { fromAddress: "+15551234567" },
            warnings: [],
        });

        await enqueueCanonicalCommunicationMirror({
            supabase: {} as never,
            orgId: "org-1",
            workflowRunId: "wr-1",
            workflowId: "wf-1",
            channelRaw: "sms",
            toRaw: "+15559876543",
            bodyRaw: "hello",
            payload: { org_id: "org-1" },
        });

        expect(resolveOutboundSenderMock).toHaveBeenCalled();
        expect(enqueueCanonicalOutboundMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                communicationIdentityId: "ident-1",
                communicationProviderAccountId: "acct-1",
                communicationProviderBindingId: "bind-1",
            })
        );
    });

    it("defers with metadata when resolution fails but still enqueues for python fallback", async () => {
        resolveOutboundSenderMock.mockResolvedValue({
            ok: false,
            failureCode: "no_eligible_identity",
            message: "none",
            warnings: [],
        });

        await enqueueCanonicalCommunicationMirror({
            supabase: {} as never,
            orgId: "org-1",
            workflowRunId: "wr-1",
            workflowId: "wf-1",
            channelRaw: "sms",
            toRaw: "+15559876543",
            bodyRaw: "hello",
            payload: { org_id: "org-1" },
        });

        expect(enqueueCanonicalOutboundMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                communicationIdentityId: null,
                metadata: expect.objectContaining({
                    sender_resolution_deferred: expect.objectContaining({
                        python_fallback_permitted: true,
                    }),
                }),
            })
        );
    });
});
