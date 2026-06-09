export const FORGE_DEEP = "#18273A";
export const BEND_PINE = "#00A283";
export const ALLOY_BLUE = "#00458C";
export const RIVER_STONE = "#F6F8FC";

/** Organic Contour #2 baseline — ripples reduced ~65% for atmospheric treatment */
export const RIPPLE_REDUCTION = 0.35;

export type AtmosphericBorderVariant = "soft-intelligence-field" | "brainwave-border" | "cloud-energy-border";

export const ATMOSPHERIC_BORDER_SPECS: Record<
    AtmosphericBorderVariant,
    {
        id: AtmosphericBorderVariant;
        label: string;
        tagline: string;
        mechanism: string;
        userRead: string;
        advantages: string[];
        risks: string[];
    }
> = {
    "soft-intelligence-field": {
        id: "soft-intelligence-field",
        label: "A · Soft Intelligence Field",
        tagline: "Uniform thick bend-pine atmosphere — low opacity, full perimeter",
        mechanism:
            "Multi-layer box glow + 4px pine border at ~12% opacity. No wave distortion. Rectangular shell unchanged.",
        userRead: '"This surface feels different" — calm intelligence airspace, not a shape.',
        advantages: ["Safest enterprise read", "Easiest to implement consistently", "Zero cartoon risk"],
        risks: ["May be subtle without enough border thickness", "Less distinctive than wave variants"],
    },
    "brainwave-border": {
        id: "brainwave-border",
        label: "B · Brainwave Border",
        tagline: "Subtle sine modulation on full perimeter — organic contour DNA at 35% amplitude",
        mechanism:
            "Low-amplitude wave stroke on all four edges. Thick pine line, heavy opacity reduction. Signal, not silhouette.",
        userRead: "Alive intelligence boundary — not a brain, not a cloud.",
        advantages: ["Carries Organic Contour #2 DNA without top-only crest", "Distinctive but restrained"],
        risks: ["Wave can read as decorative if amplitude too high", "Must stay symmetric enough for enterprise"],
    },
    "cloud-energy-border": {
        id: "cloud-energy-border",
        label: "C · Cloud Energy Border",
        tagline: "Diffuse energy wash along border — no cloud silhouette",
        mechanism:
            "Uneven pine luminance around perimeter — energy pockets at low opacity. No literal cloud path. Field turbulence.",
        userRead: "Charged atmosphere at the edge — energy, not weather.",
        advantages: ["Most 'territory' feeling", "Avoids uniform corporate border"],
        risks: ['Name "cloud" must not produce cloud shape', "Uneven glow needs art direction discipline"],
    },
};
