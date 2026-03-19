"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Section from "@/components/Section";
import Accordion from "@/components/Accordion";
import CleaningQuoteForm from "@/components/cleaning/CleaningQuoteForm";
import GetQuoteButton from "@/components/GetQuoteButton";
import PublicPageShell from "@/components/PublicPageShell";
import heroCleaningImage from "../../../public/hero/home_cleaning_hero.jpeg";

type OptionKey = "standard" | "deep" | "moveout";

const STANDARD_INCLUDED = [
  "Clean and sanitize all countertops and surfaces",
  "Wipe down appliances (exterior)",
  "Clean inside microwave",
  "Sweep and mop all floors",
  "Vacuum carpets and rugs",
  "Clean and sanitize toilets",
  "Scrub showers and tubs",
  "Clean mirrors and fixtures",
  "Dust all surfaces and furniture",
  "Make beds",
  "Empty trash and replace liners",
  "Clean windowsills",
];

const DEEP_INCLUDED = [
  "Everything in Standard Cleaning, plus:",
  "Clean inside oven and refrigerator",
  "Deep scrub baseboards and trim",
  "Clean inside cabinets (exterior and interior)",
  "Wash windows (interior)",
  "Clean blinds and window tracks",
  "Deep clean light fixtures and ceiling fans",
  "Detailed scrubbing of grout and tile",
  "Clean behind and under furniture",
  "Wipe down doors and door frames",
  "Clean vents and air registers",
  "Detailed dusting of high and low areas",
];

const FREQUENCIES = [
  { label: "One-time", description: "Perfect for special occasions or trying us out.", discount: null },
  { label: "Weekly", description: "Keep your home consistently clean every week.", discount: "30% Off" },
  { label: "Bi-Weekly", description: "Every other week for regular maintenance.", discount: "20% Off" },
  { label: "Monthly", description: "Monthly clean to keep things fresh.", discount: "10% Off" },
];

const OPTION_CARD_ICON = {
  standard: (
    <svg className="w-5 h-5 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  deep: (
    <svg className="w-5 h-5 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  ),
  moveout: (
    <svg className="w-5 h-5 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
};

const VALUE_TILES = [
  {
    title: "We don't sell your information",
    description:
      "Your information stays with us. We coordinate directly with a pro we know and trust. No lead blasting, no spam calls, no middleman chaos.",
    icon: (
      <svg className="w-8 h-8 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: "We stay involved",
    description:
      "Alloy doesn't disappear after booking. We coordinate scheduling, handle communication, and make sure everything goes smoothly. If something's not right, we fix it.",
    icon: (
      <svg className="w-8 h-8 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    title: "Fair pricing, transparent costs",
    description:
      "You pay fair prices. Pros get fair pay. No hidden fees, no surprise charges. We're transparent about costs because trust requires honesty.",
    icon: (
      <svg className="w-8 h-8 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Local pros, backed by Alloy",
    description:
      "Every cleaner is local to Bend, vetted, insured, and background-checked. We know them personally. When you book through Alloy, you're covered by Alloy.",
    icon: (
      <svg className="w-8 h-8 text-alloy-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-alloy-midnight/80 flex items-start">
          <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CleaningPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const [activeOption, setActiveOption] = useState<OptionKey | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cleaningFaqs = [
    {
      question: "What's included in a standard cleaning?",
      answer:
        "Standard cleaning covers the basics: dusting, vacuuming, mopping, bathroom and kitchen cleaning, making beds, and taking out trash. See the 'What's Included' section above for the full list.",
    },
    {
      question: "Do I need to be home during the cleaning?",
      answer:
        "No. We'll coordinate access with you beforehand. We're flexible to your preference.",
    },
    {
      question: "What if I'm not satisfied with the cleaning?",
      answer:
        "We make it right. If something isn't up to your standards, let us know within 24 hours and we'll send the pro back to fix it at no extra charge.",
    },
    {
      question: "How do I pay?",
      answer:
        "We save your payment information during booking and only charge you at the completion of the service, once you've confirmed the work was completed.",
    },
    {
      question: "Are cleaning supplies included?",
      answer:
        "Yes. Pros bring all necessary supplies and equipment. You don't need to provide anything unless you have specific product preferences.",
    },
  ];

  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      setHasRendered(true);
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } else {
      setIsOpen(false);
      setTimeout(() => {
        heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  const GetQuoteCTA = () => (
    <div className="flex justify-center mt-8">
      <GetQuoteButton defaultService="cleaning" className="home-quote-cta-pine quote-cta-bend-pine public-btn-primary w-full md:w-auto !text-white" />
    </div>
  );

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    fetch(`${apiBaseUrl}/`, { method: "GET" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = "hidden";
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [modalOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false);
        setActiveOption(null);
      }
    };
    if (modalOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [modalOpen]);

  const openOptionModal = (option: OptionKey, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveOption(option);
    setModalOpen(true);
  };

  const closeOptionModal = () => {
    setModalOpen(false);
    setActiveOption(null);
  };

  const OPTION_TITLE: Record<OptionKey, string> = {
    standard: "Standard Cleaning",
    deep: "Deep Cleaning",
    moveout: "Move-out Cleaning",
  };

  const getModalIncludedItems = (): string[] => {
    if (!activeOption) return [];
    return activeOption === "standard" ? STANDARD_INCLUDED : DEEP_INCLUDED;
  };

  useEffect(() => {
    const checkHash = () => {
      if (isOpen) return;
      const { hash, search } = window.location;
      const params = new URLSearchParams(search);
      const shouldOpen = hash === "#quote-form" || params.get("open") === "1";
      if (!shouldOpen) return;
      setIsOpen(true);
      setHasRendered(true);
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, [isOpen]);

  return (
    <PublicPageShell>
      {/* Hero — atmosphere shows through (consistent with homepage) */}
      <section className="public-hero-section" ref={heroRef}>
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          {/* Hero image: static import from web/public/hero/home_cleaning_hero.jpeg — ensures correct path and loads on all devices */}
          <div className="relative min-h-[240px] sm:min-h-[300px] md:min-h-[420px] lg:min-h-[480px] h-[240px] sm:h-[300px] md:h-[420px] lg:h-[480px] overflow-hidden rounded-xl shadow-lg">
            <Image
              src={heroCleaningImage}
              alt="Home cleaning service"
              fill
              priority
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1152px"
              className="object-cover object-[60%_40%] z-0"
            />
            <div className="absolute inset-0 z-10 bg-gradient-to-b from-alloy-midnight/45 via-alloy-midnight/15 to-transparent pointer-events-none" aria-hidden />
            <div className="absolute inset-0 z-20 flex items-end md:items-center p-4 sm:p-8 md:px-10 lg:px-12">
              <div className="max-w-[520px] space-y-2 md:space-y-4 bg-alloy-midnight/20 backdrop-blur-[2px] rounded-xl p-4 md:bg-transparent md:backdrop-blur-none md:rounded-none md:p-0">
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">
                  Home Cleaning You Can Actually Rely On
                </h1>
                <p className="text-sm md:text-lg text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.35)]">
                  Alloy provides home cleaning in Bend & Central Oregon, without the runaround.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <GetQuoteButton defaultService="cleaning" className="home-quote-cta-pine quote-cta-bend-pine public-btn-primary w-full sm:w-auto !text-white">
                    Get a quote
                  </GetQuoteButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quote Form */}
      {isOpen && (
        <Section id="quote-form" ref={formRef} className="pt-6 pb-0 bg-white">
          <div className="max-w-2xl md:max-w-4xl mx-auto">
            <div className="rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm bg-white">
              <div className="flex items-center justify-between p-4 md:p-6 border-b border-alloy-stone/20">
                <h2 className="text-xl font-bold text-alloy-midnight">Get a quote</h2>
                <button
                  onClick={handleToggle}
                  className="text-sm text-alloy-juniper hover:text-alloy-juniper/80 font-medium transition-colors"
                  aria-label="Hide form"
                  aria-expanded="true"
                  aria-controls="quote-form-content"
                >
                  Hide form
                </button>
              </div>
              <div id="quote-form-content" className="p-4 md:p-6">
                {hasRendered && <CleaningQuoteForm />}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Cleaning Options — tiles only; details in modal */}
      <Section className="py-12 md:py-16 home-section-light">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          Cleaning Options
        </h2>

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => openOptionModal("standard")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openOptionModal("standard");
                }
              }}
              className={`rounded-lg p-6 border-2 text-left transition-colors flex flex-col h-full cursor-pointer ${
                modalOpen && activeOption === "standard"
                  ? "border-alloy-blue bg-alloy-stone/30"
                  : "border-alloy-stone/50 bg-alloy-stone hover:border-alloy-stone/70"
              }`}
            >
              <div className="flex items-center gap-2">
                {OPTION_CARD_ICON.standard}
                <h3 className="text-xl font-semibold text-alloy-midnight leading-tight">
                  Standard Cleaning
                </h3>
              </div>
              <p className="text-xs text-alloy-midnight/60 mt-1 leading-tight">
                Recurring options available
              </p>
              <p className="text-alloy-midnight/80 text-sm mt-3 leading-relaxed flex-grow">
                Regular maintenance cleaning to keep your home fresh and tidy.
              </p>
              <span className="mt-4 pt-3 border-t border-alloy-stone/50">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptionModal("standard", e);
                  }}
                  className="text-sm text-alloy-blue hover:underline"
                >
                  Learn more
                </button>
              </span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => openOptionModal("deep")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openOptionModal("deep");
                }
              }}
              className={`rounded-lg p-6 border-2 text-left transition-colors flex flex-col h-full cursor-pointer ${
                modalOpen && activeOption === "deep"
                  ? "border-alloy-blue bg-alloy-stone/30"
                  : "border-alloy-stone/50 bg-alloy-stone hover:border-alloy-stone/70"
              }`}
            >
              <div className="flex items-center gap-2">
                {OPTION_CARD_ICON.deep}
                <h3 className="text-xl font-semibold text-alloy-midnight leading-tight">
                  Deep Cleaning
                </h3>
              </div>
              <p className="text-alloy-midnight/80 text-sm mt-3 leading-relaxed flex-grow">
                Thorough cleaning including baseboards, inside appliances, and detailed scrubbing.
              </p>
              <span className="mt-4 pt-3 border-t border-alloy-stone/50">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptionModal("deep", e);
                  }}
                  className="text-sm text-alloy-blue hover:underline"
                >
                  Learn more
                </button>
              </span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => openOptionModal("moveout")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openOptionModal("moveout");
                }
              }}
              className={`rounded-lg p-6 border-2 text-left transition-colors flex flex-col h-full cursor-pointer ${
                modalOpen && activeOption === "moveout"
                  ? "border-alloy-blue bg-alloy-stone/30"
                  : "border-alloy-stone/50 bg-alloy-stone hover:border-alloy-stone/70"
              }`}
            >
              <div className="flex items-center gap-2">
                {OPTION_CARD_ICON.moveout}
                <h3 className="text-xl font-semibold text-alloy-midnight leading-tight">
                  Move-out Cleaning
                </h3>
              </div>
              <p className="text-alloy-midnight/80 text-sm mt-3 leading-relaxed flex-grow">
                Comprehensive cleaning to prepare your home for the next residents.
              </p>
              <span className="mt-4 pt-3 border-t border-alloy-stone/50">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptionModal("moveout", e);
                  }}
                  className="text-sm text-alloy-blue hover:underline"
                >
                  Learn more
                </button>
              </span>
            </div>
          </div>
        </div>
        <GetQuoteCTA />
      </Section>

      {/* What Makes Alloy Different — 2 rows: image + tiles, tiles + image */}
      <Section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <h2 className="text-3xl font-bold text-alloy-midnight mb-8 md:mb-10 text-center">
            What Makes Alloy Different
          </h2>
          {/* Row 1: Image left, 2 tiles right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch mb-6 md:mb-8">
            <div className="relative h-[320px] md:h-[420px] rounded-xl shadow-md overflow-hidden bg-alloy-stone/40">
              <Image
                src="/services/cleaning/standard-1.png"
                alt="Standard cleaning"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="flex flex-col gap-6">
              {VALUE_TILES.slice(0, 2).map((tile) => (
                <div
                  key={tile.title}
                  className="bg-white rounded-lg p-6 border border-alloy-stone/30 flex gap-4 flex-1 min-h-0"
                >
                  <div className="shrink-0">{tile.icon}</div>
                  <div>
                    <h3 className="text-xl font-semibold text-alloy-blue mb-2">
                      {tile.title}
                    </h3>
                    <p className="text-alloy-midnight/80 text-sm leading-relaxed">{tile.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Row 2: 2 tiles left, image right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch">
            <div className="flex flex-col gap-6">
              {VALUE_TILES.slice(2, 4).map((tile) => (
                <div
                  key={tile.title}
                  className="bg-white rounded-lg p-6 border border-alloy-stone/30 flex gap-4 flex-1 min-h-0"
                >
                  <div className="shrink-0">{tile.icon}</div>
                  <div>
                    <h3 className="text-xl font-semibold text-alloy-blue mb-2">
                      {tile.title}
                    </h3>
                    <p className="text-alloy-midnight/80 text-sm leading-relaxed">{tile.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative h-[320px] md:h-[420px] rounded-xl shadow-md overflow-hidden bg-alloy-stone/40">
              <Image
                src="/services/cleaning/standard-2.png"
                alt="Standard cleaning"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
          <GetQuoteCTA />
        </div>
      </Section>

      {/* 2-image grid: deep cleaning + move-out */}
      <Section className="py-12 md:py-16 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          <div className="aspect-[4/3] relative overflow-hidden rounded-lg bg-alloy-stone/40">
            <Image
              src="/services/cleaning/deep-cleaning.png"
              alt="Deep cleaning"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
            />
          </div>
          <div className="aspect-[4/3] relative overflow-hidden rounded-lg bg-alloy-stone/40">
            <Image
              src="/services/cleaning/moveout.png"
              alt="Move-out cleaning"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
            />
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-16 bg-white">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto">
          {cleaningFaqs.map((faq) => (
            <Accordion key={faq.question} title={faq.question}>
              <p>{faq.answer}</p>
            </Accordion>
          ))}
        </div>
        <GetQuoteCTA />
      </Section>

      {/* Secondary CTA */}
      <Section className="py-16">
        <div className="home-cta-block rounded-lg p-8 md:p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-lg mb-6 opacity-90">
            Submit your quote request above. We'll text you shortly to confirm details.
          </p>
          <div className="flex justify-center">
            <GetQuoteButton defaultService="cleaning" className="home-quote-cta-pine quote-cta-bend-pine public-btn-primary !text-white">
              Start my quote
            </GetQuoteButton>
          </div>
        </div>
      </Section>

      {/* Option details modal — What's Included + (Standard: Frequencies | Deep/Move-out: one-time note) */}
      {modalOpen && activeOption && mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeOptionModal();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="option-modal-title"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col border border-[#59678b]/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 md:p-6 border-b border-alloy-stone/20 shrink-0">
                <h2 id="option-modal-title" className="text-xl font-bold text-alloy-midnight">
                  {OPTION_TITLE[activeOption]}
                </h2>
                <button
                  type="button"
                  onClick={closeOptionModal}
                  className="text-alloy-midnight/60 hover:text-alloy-midnight p-2 -mr-2 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 md:p-6 overflow-y-auto space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-alloy-midnight/80 uppercase tracking-wide mb-3">
                    What&apos;s Included
                  </h3>
                  <BulletList items={getModalIncludedItems()} />
                </div>
                {activeOption === "standard" && (
                  <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight/80 uppercase tracking-wide mb-3">
                      Cleaning Frequencies
                    </h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {FREQUENCIES.map((freq) => (
                        <div
                          key={freq.label}
                          className="bg-alloy-stone/30 rounded-lg p-3 border border-alloy-stone/30 text-center"
                        >
                          <h4 className="font-semibold text-alloy-blue text-sm mb-0.5">
                            {freq.label}
                            {freq.discount && (
                              <span className="block text-xs text-alloy-juniper font-normal mt-0.5">
                                ({freq.discount})
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-alloy-midnight/80">{freq.description}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-alloy-midnight/80">
                      Recurring service discounts: Weekly and bi-weekly cleanings qualify for preferred pricing. The more consistent your schedule, the better the rate. Monthly cleanings are priced individually based on your home size.
                    </p>
                  </div>
                )}
                {(activeOption === "deep" || activeOption === "moveout") && (
                  <p className="text-sm text-alloy-midnight/80">
                    Deep and Move-out cleanings are typically one-time services.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </PublicPageShell>
  );
}
