const CAPABILITIES = [
  {
    title: "One Record",
    body: "One source of truth.",
    icon: "people",
  },
  {
    title: "Secure by Design",
    body: "Permissions, security, and audit are built in.",
    icon: "shield",
  },
  {
    title: "Connected Work",
    body: "Every action moves the Business Process forward.",
    icon: "bolt",
  },
  {
    title: "Clear Communication",
    body: "Every conversation stays connected to the work.",
    icon: "chat",
  },
  {
    title: "Operational Intelligence",
    body: "Know what matters and what requires attention.",
    icon: "chart",
  },
  {
    title: "Open and Configurable",
    body: "Built to adapt without creating disconnected systems.",
    icon: "gear",
  },
] as const;

function CapabilityIcon({ name }: { name: (typeof CAPABILITIES)[number]["icon"] }) {
  const common = {
    className: "h-5 w-5 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "people":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 0115 0"
          />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3l7.5 3v5.25c0 4.556-3.028 8.606-7.5 9.75-4.472-1.144-7.5-5.194-7.5-9.75V6L12 3z"
          />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10.5h.01M12 10.5h.01M16 10.5h.01M7.5 19.5l-3 1.5 1.2-3.3A8.25 8.25 0 1119.5 12"
          />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 19.5h15M7.5 16.5v-6M12 16.5v-10.5M16.5 16.5v-3"
          />
        </svg>
      );
    case "gear":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
  }
}

export default function HeroCapabilityStrip() {
  return (
    <section aria-label="Supporting capabilities" className="border-t border-alloy-midnight-forge/8 bg-white">
      <div className="marketing-content-width py-10 md:py-12">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-6 lg:gap-0">
          {CAPABILITIES.map((item, index) => (
            <li
              key={item.title}
              className={`flex gap-3 lg:px-4 ${
                index > 0 ? "lg:border-l lg:border-alloy-midnight-forge/10" : ""
              }`}
            >
              <span className="mt-0.5 text-alloy-bend-pine">
                <CapabilityIcon name={item.icon} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[0.95rem] font-semibold leading-snug text-alloy-midnight-forge">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-snug text-alloy-midnight-forge/55">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
