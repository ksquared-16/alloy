const VALUE_PROPS = [
  {
    title: "From siloed to streamlined",
    body: "All your work, people, and data connected in one place—so your team can focus on what matters.",
    icon: "streamline",
    emphasize: true,
  },
  {
    title: "Save time",
    body: "One system. Less switching.",
    icon: "clock",
  },
  {
    title: "Reduce risk",
    body: "Secure by design. Built for compliance.",
    icon: "target",
  },
  {
    title: "Drive impact",
    body: "Clear insights. Better decisions.",
    icon: "trend",
  },
] as const;

function ValuePropIcon({ name }: { name: (typeof VALUE_PROPS)[number]["icon"] }) {
  const common = {
    className: "h-4 w-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "streamline":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 8l4 4-4 4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "trend":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 16.5l5.5-5.5 3.5 3.5 7-7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 7.5H19.5V12.5" />
        </svg>
      );
  }
}

/**
 * Outcome strip under the problem section — same composition language as HeroCapabilityStrip.
 * `embedded` places it inside a muted chapter (white card on River Stone) instead of a full-bleed band.
 */
export default function ValuePropStrip({ embedded = false }: { embedded?: boolean }) {
  const list = (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
      {VALUE_PROPS.map((item, index) => (
        <li
          key={item.title}
          className={`flex gap-2.5 lg:flex-col lg:gap-2 lg:px-5 ${
            index > 0 ? "lg:border-l lg:border-alloy-midnight-forge/[0.08]" : ""
          }`}
        >
          <span className="mt-0.5 text-alloy-bend-pine lg:mt-0">
            <ValuePropIcon name={item.icon} />
          </span>
          <div className="min-w-0">
            <h3
              className={`text-[0.8125rem] font-semibold leading-snug tracking-[-0.01em] ${
                "emphasize" in item && item.emphasize
                  ? "text-alloy-bend-pine"
                  : "text-alloy-midnight-forge"
              }`}
            >
              {item.title}
            </h3>
            <p className="mt-1 text-[0.75rem] leading-snug text-alloy-midnight-forge/60">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );

  if (embedded) {
    return (
      <div
        aria-label="Why Alloy"
        className="mt-3 rounded-xl border-2 border-alloy-bend-pine bg-white px-4 py-3 md:mt-4 md:px-2 md:py-3.5"
      >
        {list}
      </div>
    );
  }

  return (
    <section
      aria-label="Why Alloy"
      className="border-y border-alloy-midnight-forge/[0.07] bg-white"
    >
      <div className="marketing-content-width py-5 md:py-6">{list}</div>
    </section>
  );
}
