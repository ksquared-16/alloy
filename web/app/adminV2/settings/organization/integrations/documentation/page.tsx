/**
 * Developer Documentation.
 *
 * Reads the governed sources in the repository and renders them as plain text —
 * there is deliberately no second specification and no second copy of the guides.
 * The API reference is the governed OpenAPI document itself, linked rather than
 * restated, because a hand-maintained mirror is how a reference starts lying.
 *
 * Read-only. There is no interactive "Try it": that would need a credential or a
 * session in the browser, and its security has not been independently proven.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");

/** The entries Gate 2 requires, each pointing at a governed source. */
const SECTIONS = [
    { id: "getting-started", title: "Getting Started", file: "docs/api/developer-platform/guide/README.md" },
    { id: "authentication", title: "Authentication", file: "docs/api/developer-platform/02-identity-installation-credential.md" },
    { id: "applications", title: "Applications and Installations", file: "docs/api/developer-platform/02-identity-installation-credential.md" },
    { id: "scopes", title: "Scopes", file: "docs/api/developer-platform/03-authorization-scopes-boundaries.md" },
    { id: "locations", title: "Locations", file: "docs/api/developer-platform/guide/locations.md" },
    { id: "conventions", title: "Conventions", file: "docs/api/developer-platform/guide/conventions.md" },
] as const;

function readDoc(relative: string): string | null {
    try {
        return readFileSync(path.join(REPO_ROOT, relative), "utf8");
    } catch {
        // A missing governed source is reported, never silently blank: a section
        // that renders empty reads as "there is nothing to say".
        return null;
    }
}

export default function DeveloperDocumentationPage() {
    const docs = SECTIONS.map((s) => ({ ...s, body: readDoc(s.file) }));

    return (
        <div className="w-full min-w-0 p-6" data-testid="developer-documentation">
            <header>
                <h1 className="text-lg font-medium">Developer documentation</h1>
                <p className="mt-1 text-sm opacity-75">
                    How external software authenticates with Alloy and what it may read.
                </p>
            </header>

            <nav className="mt-4 text-sm" data-testid="developer-documentation-index">
                <ul className="flex flex-wrap gap-3">
                    {docs.map((d) => (
                        <li key={d.id}><a className="underline" href={`#${d.id}`}>{d.title}</a></li>
                    ))}
                    <li>
                        <a className="underline" href="/api/admin/integrations/openapi" data-testid="developer-documentation-api-reference">
                            API Reference
                        </a>
                    </li>
                </ul>
            </nav>

            <p className="mt-3 text-xs opacity-70">
                The API reference is the governed OpenAPI document for the public API. It is the one
                specification; nothing here restates it.
            </p>

            {docs.map((d) => (
                <section key={d.id} id={d.id} className="mt-6" data-testid={`doc-section-${d.id}`}>
                    <h2 className="text-sm font-medium">{d.title}</h2>
                    {d.body === null ? (
                        <p className="mt-1 text-sm opacity-70">
                            This document is not available in this build ({d.file}).
                        </p>
                    ) : (
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded border p-3 text-xs">
                            {d.body}
                        </pre>
                    )}
                </section>
            ))}
        </div>
    );
}
