"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { motion, stagger, useAnimate } from "motion/react";
import Floating, { FloatingElement } from "@/components/ui/parallax-floating";

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

  useEffect(() => {
    animate("img", { opacity: [0, 1] }, { duration: 0.55, delay: stagger(0.14) });
  }, [animate]);

  return (
    <section
      ref={scope}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black"
    >
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
          href="/"
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
    </section>
  );
};

export { Preview };
