"use client";

import Image from "next/image";
import type { OnboardingAvatar, OnboardingAvatarAccessory } from "@/lib/types";

export type SpriteHeadTone = "porcelain" | "fair" | "beige" | "warm" | "tan" | "brown" | "deep";
export type SpriteHairStyle =
  | "short-umber"
  | "short-blonde"
  | "short-brown"
  | "short-charcoal"
  | "short-black"
  | "ponytail-violet"
  | "ponytail-blonde"
  | "ponytail-platinum";
export type SpriteOutfitStyle =
  | "green-tunic"
  | "blue-vest"
  | "blue-guard"
  | "red-vest"
  | "violet-vest"
  | "brown-leather"
  | "tan-traveler";

export type SpriteParts = {
  head: SpriteHeadTone;
  hair: SpriteHairStyle;
  outfit: SpriteOutfitStyle;
};

export const DEFAULT_SPRITE_PARTS: SpriteParts = {
  head: "beige",
  hair: "short-brown",
  outfit: "blue-guard",
};

export const HEAD_TONE_OPTIONS = ["porcelain", "fair", "beige", "warm", "tan", "brown", "deep"] as const;
export const HAIR_STYLE_OPTIONS = [
  "short-umber",
  "short-blonde",
  "short-brown",
  "short-charcoal",
  "short-black",
  "ponytail-violet",
  "ponytail-blonde",
  "ponytail-platinum",
] as const;
export const OUTFIT_STYLE_OPTIONS = [
  "green-tunic",
  "blue-vest",
  "blue-guard",
  "red-vest",
  "violet-vest",
  "brown-leather",
  "tan-traveler",
] as const;

type PixelSpriteVariant = "front" | "side";

function normalizeSpriteOption<T extends string>(
  options: readonly T[],
  value: string | undefined,
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function parseSpriteParts(spriteId: string): SpriteParts {
  const values = Object.fromEntries(
    spriteId
      .split("|")
      .map((segment) => segment.trim())
      .map((segment) => segment.split(":").map((part) => part.trim()))
      .filter((parts) => parts.length === 2 && parts[0] && parts[1]),
  ) as Record<string, string>;

  return {
    head: normalizeSpriteOption(
      HEAD_TONE_OPTIONS,
      values.head,
      DEFAULT_SPRITE_PARTS.head,
    ),
    hair: normalizeSpriteOption(
      HAIR_STYLE_OPTIONS,
      values.hair,
      DEFAULT_SPRITE_PARTS.hair,
    ),
    outfit: normalizeSpriteOption(
      OUTFIT_STYLE_OPTIONS,
      values.outfit,
      DEFAULT_SPRITE_PARTS.outfit,
    ),
  };
}

export function buildSpriteId(parts: SpriteParts) {
  return [
    "v3",
    `head:${parts.head}`,
    `hair:${parts.hair}`,
    `outfit:${parts.outfit}`,
  ].join("|");
}

export function accessoryFromHairStyle(hair: SpriteHairStyle): OnboardingAvatarAccessory {
  if (hair.startsWith("ponytail-")) return "headphones";
  return "none";
}

const HAIR_LAYER_MAP: Record<SpriteHairStyle, { front: string; side: string }> = {
  "short-umber": { front: "short-umber", side: "short-umber" },
  "short-blonde": { front: "short-blonde", side: "short-blonde" },
  "short-brown": { front: "short-brown", side: "short-brown" },
  "short-charcoal": { front: "short-charcoal", side: "short-charcoal" },
  "short-black": { front: "short-black", side: "short-black" },
  "ponytail-violet": { front: "ponytail-violet", side: "ponytail-violet" },
  "ponytail-blonde": { front: "ponytail-blonde", side: "ponytail-blonde" },
  "ponytail-platinum": { front: "ponytail-platinum", side: "ponytail-platinum" },
};

function spritePartSrc(path: string) {
  return `/sprite-parts/${path}.png`;
}

export function PixelAvatar({
  avatar,
  variant = "front",
  size = 144,
}: {
  avatar: OnboardingAvatar;
  variant?: PixelSpriteVariant;
  size?: number;
}) {
  const parts = parseSpriteParts(avatar.spriteId);
  const hairLayers = HAIR_LAYER_MAP[parts.hair] ?? HAIR_LAYER_MAP[DEFAULT_SPRITE_PARTS.hair];
  return (
    <div
      className="relative shrink-0"
      style={{
        width: `${size}px`,
        height: `${Math.round(size * 1.16)}px`,
      }}
    >
      <div className="absolute left-[11%] top-[48%] h-[45%] w-[78%]">
        <Image
          src={spritePartSrc(`clothes/${parts.outfit}`)}
          alt=""
          fill
          unoptimized
          style={{ imageRendering: "pixelated", objectFit: "fill" }}
        />
      </div>
      <div className="absolute left-[10%] top-[5%] h-[52%] w-[80%]">
        <Image
          src={spritePartSrc(`head/${parts.head}`)}
          alt=""
          fill
          unoptimized
          style={{ imageRendering: "pixelated", objectFit: "fill" }}
        />
      </div>
      <div className="absolute left-[14%] top-[-1%] h-[42%] w-[72%]">
        <Image
          src={spritePartSrc(`hair/${variant === "side" ? "side" : "front"}/${variant === "side" ? hairLayers.side : hairLayers.front}`)}
          alt=""
          fill
          unoptimized
          style={{ imageRendering: "pixelated", objectFit: "fill" }}
        />
      </div>
    </div>
  );
}
