/**
 * Business Processes progression — SVG icons/connectors + HTML labels.
 * No baked marketing copy in raster. See ALLOY-MARKETING-ASSET-RENDERING-AUDIT.md.
 */

const STEPS = [
  {
    key: "stage",
    label: "1. Stage",
    title: "Work begins",
    icon: "flag" as const,
  },
  {
    key: "requirements",
    label: "2. Requirements",
    title: "Gather what's needed",
    icon: "clipboard" as const,
  },
  {
    key: "decision",
    label: "3. Decision",
    title: "Make the call",
    icon: "decision" as const,
  },
  {
    key: "outcome",
    label: "4. Outcome",
    title: "Record the outcome",
    icon: "signpost" as const,
  },
  {
    key: "next",
    label: "5. Next step",
    title: "Move work forward",
    icon: "forward" as const,
  },
] as const;

function StepIcon({ name }: { name: (typeof STEPS)[number]["icon"] }) {
  const common = {
    className: "h-7 w-7 text-alloy-midnight-forge",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "flag":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4.5" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 5.25h8.25l-1.2 2.7 1.2 2.7H5"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-alloy-bend-pine"
            stroke="currentColor"
            d="M9.2 6.6c.7.35 1.5.4 2.2.15"
          />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 4.5h6M8.25 4.5A1.75 1.75 0 006.5 6.25v12A1.75 1.75 0 008.25 20h7.5A1.75 1.75 0 0017.5 18.25v-12A1.75 1.75 0 0015.75 4.5"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-alloy-bend-pine"
            stroke="currentColor"
            d="M9.5 10.5l1.25 1.25L13.5 9M9.5 14.5l1.25 1.25L13.5 13"
          />
        </svg>
      );
    case "decision":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.5 11a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM20.5 11a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M1.5 19.5a4.5 4.5 0 018.7-1.6M13.8 17.9a4.5 4.5 0 018.7 1.6"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-alloy-bend-pine"
            stroke="currentColor"
            d="M12 5.5l.7 1.4 1.5.2-1.1 1.1.3 1.5L12 8.9l-1.4.8.3-1.5-1.1-1.1 1.5-.2.7-1.4z"
          />
        </svg>
      );
    case "signpost":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 7h6.5L17 9l1.5 2H12"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-alloy-bend-pine"
            stroke="currentColor"
            d="M12 13H5.5L7 15l-1.5 2H12"
          />
        </svg>
      );
    case "forward":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-alloy-bend-pine"
            stroke="currentColor"
            d="M6 7.5l5.5 4.5L6 16.5"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 7.5L18 12l-5.5 4.5" />
        </svg>
      );
  }
}

function Connector({ dotted = false }: { dotted?: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-[1.375rem] left-[calc(50%+1.75rem)] hidden h-px w-[calc(100%-3.5rem)] md:block"
    >
      <div
        className={`h-px w-full ${
          dotted
            ? "bg-[repeating-linear-gradient(90deg,rgba(39,63,82,0.28)_0_4px,transparent_4px_8px)]"
            : "bg-alloy-midnight-forge/25"
        }`}
      />
      <span className="absolute top-1/2 right-0 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-t border-r border-alloy-midnight-forge/35" />
    </div>
  );
}

export default function BusinessProcessFlow() {
  return (
    <ol
      aria-label="Business Process stages"
      className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:gap-0 md:overflow-visible md:pb-0"
    >
      {STEPS.map((step, index) => (
        <li
          key={step.key}
          className="relative w-[42%] shrink-0 snap-center text-center sm:w-[36%] md:w-auto md:shrink md:px-2"
        >
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-alloy-midnight-forge/[0.1] bg-white shadow-[0_1px_4px_rgba(24,39,58,0.06)]">
            <StepIcon name={step.icon} />
          </div>
          {index < STEPS.length - 1 ? <Connector dotted={index === STEPS.length - 2} /> : null}
          <p className="marketing-eyebrow mt-3.5 !text-[0.625rem]">{step.label}</p>
          <p className="mt-1.5 text-sm font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
            {step.title}
          </p>
        </li>
      ))}
    </ol>
  );
}
