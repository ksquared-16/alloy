import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CodeBlock } from "@/components/developerDocs/CodeBlock";
import { resolveDocumentationLink } from "@/lib/developerDocs/documentationSources";
import type { BlockNode, InlineNode } from "@/lib/developerDocs/markdown";

/**
 * The governed Markdown, drawn in Alloy's visual language.
 *
 * Every text node arrives as React children, so the browser renders authored content as text and
 * never as markup. There is no `dangerouslySetInnerHTML` in this path by design, not by oversight:
 * the parser's job is to produce a tree precisely so this component never has to trust a string.
 *
 * Reading, not scanning. The measure is capped, headings carry their own anchors, and code sits in
 * a dark block a developer recognises — the rest of Alloy's density rules are tuned for operators
 * working a queue, which is the opposite of what someone reading a specification needs.
 */
export function DocumentationRenderer({
    blocks,
    sourceFile,
}: {
    blocks: BlockNode[];
    /** The document's own path, so relative links resolve against where they were written. */
    sourceFile: string;
}) {
    return (
        <div className="doc-prose" data-testid="documentation-body">
            {blocks.map((block, index) => (
                <Block key={index} block={block} sourceFile={sourceFile} />
            ))}
        </div>
    );
}

function Block({ block, sourceFile }: { block: BlockNode; sourceFile: string }): ReactNode {
    switch (block.type) {
        case "heading": {
            const content = <Inline nodes={block.children} sourceFile={sourceFile} />;
            const common = "scroll-mt-24 font-semibold tracking-tight text-alloy-midnight";
            if (block.depth <= 2) {
                return (
                    <h2 id={block.id} className={`${common} mt-7 border-t border-alloy-stone/60 pt-5 text-[17px] first:mt-0 first:border-0 first:pt-0`}>
                        {content}
                    </h2>
                );
            }
            if (block.depth === 3) {
                return <h3 id={block.id} className={`${common} mt-5 text-[14px]`}>{content}</h3>;
            }
            return (
                <h4 id={block.id} className={`${common} mt-4 text-[12px] uppercase tracking-[0.08em] text-alloy-midnight/70`}>
                    {content}
                </h4>
            );
        }
        case "paragraph":
            return (
                <p className="mt-2.5 text-[13.5px] leading-[1.75] text-alloy-midnight/85">
                    <Inline nodes={block.children} sourceFile={sourceFile} />
                </p>
            );
        case "list": {
            const className = "mt-2.5 space-y-1.5 pl-5 text-[13.5px] leading-[1.7] text-alloy-midnight/85 marker:text-alloy-midnight/35";
            const items = block.items.map((item, index) => (
                <li key={index} className="pl-1">
                    {item.children.map((child, childIndex) => (
                        <Block key={childIndex} block={child} sourceFile={sourceFile} />
                    ))}
                </li>
            ));
            return block.ordered ?
                <ol start={block.start} className={`list-decimal ${className}`}>{items}</ol>
            :   <ul className={`list-disc ${className}`}>{items}</ul>;
        }
        case "code":
            return <CodeBlock code={block.value} lang={block.lang} />;
        case "table":
            return (
                <div className="mt-3 overflow-x-auto rounded-lg border border-alloy-forge/10">
                    <table className="w-full border-collapse text-[12.5px]">
                        <thead className="bg-alloy-stone/60">
                            <tr>
                                {block.head.map((cell, index) => (
                                    <th key={index} className="border-b border-alloy-forge/10 px-2.5 py-1.5 text-left font-semibold text-alloy-midnight">
                                        <Inline nodes={cell} sourceFile={sourceFile} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b border-alloy-stone/60 last:border-0">
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-2.5 py-1.5 align-top text-alloy-midnight/80">
                                            <Inline nodes={cell} sourceFile={sourceFile} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case "callout": {
            const warning = block.tone === "warning";
            const Icon = warning ? AlertTriangle : Info;
            return (
                <aside
                    data-doc-block="callout"
                    data-doc-callout-tone={block.tone}
                    className={`mt-4 rounded-lg border px-3.5 py-3 ${
                        warning ?
                            "border-alloy-ember/25 bg-alloy-ember/[0.05]"
                        :   "border-alloy-blue/20 bg-alloy-blue/[0.04]"
                    }`}
                >
                    <div className="flex items-start gap-2">
                        <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${warning ? "text-alloy-ember" : "text-alloy-blue"}`}
                            aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                            {block.title ?
                                <p className={`text-[13px] font-semibold ${warning ? "text-alloy-ember" : "text-alloy-blue"}`}>
                                    {/*
                                      * The callout already draws an icon, so an authored warning
                                      * glyph at the start of the title renders as a second one.
                                      * Dropped here rather than edited out of the canonical source:
                                      * the Markdown is correct as Markdown, where there is no icon.
                                      */}
                                    <Inline nodes={stripLeadingGlyph(block.title)} sourceFile={sourceFile} />
                                </p>
                            :   null}
                            <div className="[&>p:first-child]:mt-1">
                                {block.children.map((child, index) => (
                                    <Block key={index} block={child} sourceFile={sourceFile} />
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>
            );
        }
        case "rule":
            return <hr className="mt-6 border-alloy-stone/70" />;
        default:
            return null;
    }
}

/** Remove a leading ⚠/❗/ℹ and the space after it from a callout title. */
function stripLeadingGlyph(nodes: InlineNode[]): InlineNode[] {
    const [first, ...rest] = nodes;
    if (!first || first.type !== "text") return nodes;
    const trimmed = first.value.replace(/^\s*[⚠❗️ℹ️⚡🚨]+\uFE0F?\s*/u, "");
    return trimmed === first.value ? nodes : [{ type: "text", value: trimmed }, ...rest];
}

function Inline({ nodes, sourceFile }: { nodes: InlineNode[]; sourceFile: string }): ReactNode {
    return (
        <>
            {nodes.map((node, index) => {
                switch (node.type) {
                    case "text":
                        return <span key={index}>{node.value}</span>;
                    case "code":
                        return (
                            <code
                                key={index}
                                className="rounded border border-alloy-forge/10 bg-alloy-stone/70 px-1 py-px font-mono text-[0.88em] text-alloy-midnight"
                            >
                                {node.value}
                            </code>
                        );
                    case "strong":
                        return (
                            <strong key={index} className="font-semibold text-alloy-midnight">
                                <Inline nodes={node.children} sourceFile={sourceFile} />
                            </strong>
                        );
                    case "emphasis":
                        return (
                            <em key={index}>
                                <Inline nodes={node.children} sourceFile={sourceFile} />
                            </em>
                        );
                    case "link": {
                        const href = resolveDocumentationLink(node.href, sourceFile);
                        const label = <Inline nodes={node.children} sourceFile={sourceFile} />;
                        /*
                         * A link nobody outside Alloy can follow is not a link. Repository-relative
                         * paths that are not published documentation degrade to their own text, so
                         * the sentence still reads and the reader is never sent nowhere.
                         */
                        if (!href) return <span key={index}>{label}</span>;
                        if (/^https?:\/\//i.test(href)) {
                            return (
                                <a
                                    key={index}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-[#007d68] underline decoration-alloy-bend-pine/35 underline-offset-2 hover:decoration-alloy-bend-pine"
                                >
                                    {label}
                                </a>
                            );
                        }
                        return (
                            <Link
                                key={index}
                                href={href}
                                className="font-medium text-[#007d68] underline decoration-alloy-bend-pine/35 underline-offset-2 hover:decoration-alloy-bend-pine"
                            >
                                {label}
                            </Link>
                        );
                    }
                    default:
                        return null;
                }
            })}
        </>
    );
}
