"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Music2, VolumeX, X } from "lucide-react";
import { motion, stagger, useAnimate } from "motion/react";
import Floating, { FloatingElement } from "@/components/ui/parallax-floating";
import ClassicLoader from "@/components/ui/loader";
import { useBackgroundMusic } from "@/components/audio/background-music-provider";

const exampleImages = [
  {
    url: "https://images.unsplash.com/photo-1727341554370-80e0fe9ad082?q=80&w=1200&auto=format&fit=crop",
    title: "Life",
  },
  {
    url: "https://images.unsplash.com/photo-1562016600-ece13e8ba570?q=80&w=1200&auto=format&fit=crop",
    title: "Nature",
  },
  {
    url: "https://images.unsplash.com/photo-1624344965199-ed40391d20f2?q=80&w=1200&auto=format&fit=crop",
    title: "Wealth",
  },
  {
    url: "https://images.unsplash.com/photo-1726083085160-feeb4e1e5b00?q=80&w=1200&auto=format&fit=crop",
    title: "Career",
  },
  {
    url: "https://images.unsplash.com/photo-1689553079282-45df1b35741b?q=80&w=1200&auto=format&fit=crop",
    title: "Money",
  },
  {
    url: "https://images.unsplash.com/photo-1640680608781-2e4199dd1579?q=80&w=1200&auto=format&fit=crop",
    title: "Stocks",
  },
  {
    url: "https://images.unsplash.com/photo-1677338354108-223e807fb1bd?q=80&w=1200&auto=format&fit=crop",
    title: "Relationship",
  },
  {
    url: "https://images.unsplash.com/photo-1721968317938-cf8c60fccd1a?q=80&w=1200&auto=format&fit=crop",
    title: "Career Growth",
  },
];

const imageBaseClasses =
  "object-cover shadow-[0_20px_45px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:scale-105";

const Preview = () => {
  const [scope, animate] = useAnimate();
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const { isMusicOn, toggleMusic } = useBackgroundMusic();
  const openInfoModal = useCallback(() => setIsInfoOpen(true), []);
  const closeInfoModal = useCallback(() => setIsInfoOpen(false), []);

  useEffect(() => {
    animate("img", { opacity: [0, 1] }, { duration: 0.55, delay: stagger(0.14) });
  }, [animate]);

  useEffect(() => {
    if (!isInfoOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsInfoOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isInfoOpen]);

  return (
    <section
      ref={scope}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black"
    >
      <button
        type="button"
        onClick={toggleMusic}
        aria-pressed={isMusicOn}
        aria-label={isMusicOn ? "Mute background music" : "Unmute background music"}
        className="fixed right-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/45 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/60 hover:bg-black/65 sm:right-6 sm:top-6"
      >
        <Music2 className="h-4 w-4" />
        <span>Music</span>
        {isMusicOn ? <span className="text-white/80">On</span> : <VolumeX className="h-4 w-4" />}
      </button>

      <motion.div
        className="z-20 flex max-w-[680px] flex-col items-center space-y-4 px-6 text-center"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.88, delay: 1.2 }}
      >
        <p className="font-serif text-4xl italic leading-[1.02] text-white sm:text-6xl md:text-7xl">
          simulate your life with one click.
        </p>
        <p className="max-w-[560px] text-sm text-white/80 sm:text-base">
          See how your life, money, career, relationships pan out in the next 1-10 years
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:scale-105"
        >
          start now <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </motion.div>

      <Floating sensitivity={-1} className="overflow-hidden">
        <FloatingElement depth={0.5} className="left-[6%] top-[9%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[0].url}
            alt={exampleImages[0].title}
            className={`${imageBaseClasses} h-20 w-20 md:h-28 md:w-28`}
            loading="lazy"
          />
        </FloatingElement>
        <FloatingElement depth={1} className="left-[27%] top-[8%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[1].url}
            alt={exampleImages[1].title}
            className={`${imageBaseClasses} h-24 w-24 md:h-32 md:w-32`}
            loading="lazy"
          />
        </FloatingElement>
        <FloatingElement depth={2} className="left-[50%] top-[4%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[2].url}
            alt={exampleImages[2].title}
            className={`${imageBaseClasses} h-40 w-28 md:h-52 md:w-40`}
            loading="lazy"
          />
        </FloatingElement>
        <FloatingElement depth={1} className="left-[81%] top-[3%] hidden sm:block">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[3].url}
            alt={exampleImages[3].title}
            className={`${imageBaseClasses} h-24 w-24 md:h-32 md:w-32`}
            loading="lazy"
          />
        </FloatingElement>

        <FloatingElement depth={1} className="left-[2%] top-[42%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[4].url}
            alt={exampleImages[4].title}
            className={`${imageBaseClasses} h-24 w-24 md:h-36 md:w-36`}
            loading="lazy"
          />
        </FloatingElement>
        <FloatingElement depth={2} className="left-[76%] top-[67%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[5].url}
            alt={exampleImages[5].title}
            className={`${imageBaseClasses} h-32 w-24 md:h-48 md:w-36`}
            loading="lazy"
          />
        </FloatingElement>
        <FloatingElement depth={4} className="left-[14%] top-[70%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[6].url}
            alt={exampleImages[6].title}
            className={`${imageBaseClasses} h-40 w-32 md:h-56 md:w-44`}
            loading="lazy"
          />
        </FloatingElement>
        <FloatingElement depth={1} className="left-[49%] top-[82%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={exampleImages[7].url}
            alt={exampleImages[7].title}
            className={`${imageBaseClasses} h-24 w-24 md:h-32 md:w-32`}
            loading="lazy"
          />
        </FloatingElement>
      </Floating>

      <button
        type="button"
        aria-haspopup="dialog"
        aria-controls="landing-project-modal"
        aria-expanded={isInfoOpen}
        onClick={openInfoModal}
        className="group fixed bottom-4 right-4 z-30 flex h-32 w-32 items-center justify-center rounded-full sm:bottom-6 sm:right-6 sm:h-40 sm:w-40"
      >
        <svg
          viewBox="0 0 150 150"
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full animate-[spin_15s_linear_infinite] drop-shadow-[0_0_10px_rgba(238,186,48,0.45)]"
        >
          <defs>
            <path
              id="sprite-click-ring"
              d="M 75,75 m -58,0 a 58,58 0 1,1 116,0 a 58,58 0 1,1 -116,0"
            />
          </defs>
          <text
            fill="#eeba30"
            fontSize="13"
            fontWeight="700"
            letterSpacing="1.6"
            style={{ textTransform: "uppercase" }}
          >
            <textPath href="#sprite-click-ring">
              click me! • click me! • click me! •
            </textPath>
          </text>
        </svg>

        <Image
          src="/interviewer/sprite_excited.png"
          alt="Excited interviewer sprite"
          width={112}
          height={112}
          priority
          className="pointer-events-none relative z-10 h-24 w-24 transition-transform duration-200 group-hover:scale-105 sm:h-28 sm:w-28"
        />
        <span className="sr-only">Open information about the project and team</span>
      </button>

      {isInfoOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/76 px-4 py-6 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeInfoModal();
            }
          }}
        >
          <div
            id="landing-project-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-project-title"
            className="landing-info-modal relative w-full max-w-2xl px-6 pb-7 pt-8 text-left sm:px-10 sm:pb-9 sm:pt-10"
          >
            <button
              type="button"
              onClick={closeInfoModal}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d3a625]/60 bg-black/45 text-[#f7e9bf] transition-colors hover:border-[#eeba30] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#eeba30]"
              aria-label="Close project and team details"
            >
              <X className="h-4 w-4" />
            </button>

            <h2
              id="landing-project-title"
              className="arcane-display-title text-3xl font-extrabold uppercase leading-tight tracking-[0.07em] text-[#f7e9bf] [text-shadow:0_1px_0_#6a4c12,0_0_18px_rgba(238,186,48,0.32)] sm:text-4xl"
            >
              The Oracle
            </h2>

            <div className="mt-6 grid gap-5 text-sm text-[#efe4c6]/90 sm:grid-cols-2 sm:gap-6 sm:text-base">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#eeba30]">
                  The Project
                </h3>
                <p className="leading-relaxed">
                  Add personal context. Let LLM simulate how your life would change depending on the actions you take!
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#eeba30]">
                  The Team
                </h3>
                <p className="leading-relaxed">
                  Danny Chen
                  <br />
                  Melchai Mathew
                  <br />
                  John Hartmann
                </p>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export { Preview };

export default function DemoOne() {
  return <ClassicLoader />;
}
