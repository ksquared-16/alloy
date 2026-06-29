import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    WorkspaceFirstPaintSeedProvider,
    useWorkspaceFirstPaintLifecycleSeed,
} from "@/lib/adminV2/runtime/workspaceFirstPaintSeed";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const CARD: OperatorLifecycleLandingCard = {
    id: "lc-1",
    departmentId: "dept-1",
    processKey: "enrollment",
    label: "Enrollment",
    description: "Enrollment lifecycle",
    entryHref: "/workspace/work-unit/new-leads",
    workQueues: [],
    stageCount: 3,
    activeRecordCount: null,
    needsAttentionCount: null,
};

function Probe() {
    const seed = useWorkspaceFirstPaintLifecycleSeed();
    return <span data-seed-count={seed.length}>{seed.map((c) => c.id).join(",")}</span>;
}

/**
 * Runtime convergence Phase 2 — Slice 2 (server-seed /workspace first paint).
 * The server layout resolves lifecycle landing cards and provides them through context so the
 * client landing page reveals once with tiles present (Operational Runtime Doctrine Laws 1/3/5).
 */
describe("workspace server-seed first paint", () => {
    it("provides server-seeded cards to consumers (SSR)", () => {
        const html = renderToStaticMarkup(
            <WorkspaceFirstPaintSeedProvider initialLifecycleCards={[CARD]}>
                <Probe />
            </WorkspaceFirstPaintSeedProvider>,
        );
        expect(html).toContain('data-seed-count="1"');
        expect(html).toContain("lc-1");
    });

    it("defaults to empty when not seeded (additive — prior behavior preserved)", () => {
        const html = renderToStaticMarkup(<Probe />);
        expect(html).toContain('data-seed-count="0"');
    });

    it("server loader builds cards from shared inputs and is server-only + graceful", () => {
        const src = read("lib/admin/loadOperatorLifecycleLandingServer.ts");
        expect(src).toContain('import "server-only"');
        expect(src).toContain("buildLifecycleCatalog");
        expect(src).toContain("applyDepartmentAccessScope"); // same access scoping as the API routes
        expect(src).toContain("buildOperatorLifecycleLandingCards"); // same pure builder as the client
        expect(src).toContain("return [];"); // graceful fallback keeps the rollback path intact
    });

    it("server layout seeds the landing and passes it to the workspace providers", () => {
        const layout = read("app/adminV2/workspace/layout.tsx");
        expect(layout).toContain("loadOperatorLifecycleLandingCardsServer()");
        expect(layout).toContain("initialLifecycleCards={initialLifecycleCards}");
    });

    it("providers expose the seed via WorkspaceFirstPaintSeedProvider", () => {
        const providers = read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        expect(providers).toContain("WorkspaceFirstPaintSeedProvider");
        expect(providers).toContain("initialLifecycleCards={initialLifecycleCards}");
    });

    it("client landing page initializes first-paint tiles from the seed (peek wins, else seed)", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("useWorkspaceFirstPaintLifecycleSeed");
        // peek (warm module cache) takes priority; server seed is the cold first-paint source.
        expect(page).toContain("if (peeked?.length) return peeked;");
        expect(page).toContain("initialLifecycleCards.length ? [...initialLifecycleCards] : []");
    });
});
