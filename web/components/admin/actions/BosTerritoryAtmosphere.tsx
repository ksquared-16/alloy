"use client";

import type { CSSProperties } from "react";

type MeshBlob = {
    style: CSSProperties;
    "data-bos-atmosphere-blob": string;
};

/** Room atmosphere — heavier top canopy, softer flanks, calm base. */
const MESH_BLOBS: MeshBlob[] = [
    {
        "data-bos-atmosphere-blob": "canopy-center",
        style: {
            top: "-8%",
            left: "28%",
            width: "44%",
            height: "26%",
            background:
                "radial-gradient(ellipse 85% 75% at 50% 85%, rgba(0,162,131,0.16), transparent 68%)",
        },
    },
    {
        "data-bos-atmosphere-blob": "canopy-left",
        style: {
            top: "-4%",
            left: "4%",
            width: "26%",
            height: "20%",
            background:
                "radial-gradient(ellipse 100% 80% at 55% 70%, rgba(0,162,131,0.12), transparent 72%)",
        },
    },
    {
        "data-bos-atmosphere-blob": "canopy-right",
        style: {
            top: "-2%",
            right: "10%",
            width: "16%",
            height: "14%",
            background:
                "radial-gradient(ellipse 90% 70% at 40% 60%, rgba(0,162,131,0.08), transparent 74%)",
        },
    },
    {
        "data-bos-atmosphere-blob": "flank-left",
        style: {
            top: "32%",
            left: "0%",
            width: "12%",
            height: "28%",
            background:
                "radial-gradient(ellipse 70% 100% at 90% 50%, rgba(0,162,131,0.06), transparent 78%)",
        },
    },
    {
        "data-bos-atmosphere-blob": "base-broad",
        style: {
            bottom: "0%",
            left: "18%",
            width: "64%",
            height: "18%",
            background:
                "radial-gradient(ellipse 100% 70% at 50% 30%, rgba(0,162,131,0.10), transparent 72%)",
        },
    },
];

export function BosTerritoryAtmosphere() {
    return (
        <div
            className="pointer-events-none absolute inset-0 z-0 overflow-visible"
            data-bos-territory-atmosphere="true"
            aria-hidden
        >
            {MESH_BLOBS.map((blob) => (
                <div
                    key={blob["data-bos-atmosphere-blob"]}
                    className="absolute"
                    style={blob.style}
                    data-bos-atmosphere-blob={blob["data-bos-atmosphere-blob"]}
                />
            ))}
        </div>
    );
}
