"use client";

import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import {
    PixelAvatar,
    SpriteParts,
    SpriteHairStyle,
    HEAD_TONE_OPTIONS,
    HAIR_STYLE_OPTIONS,
    OUTFIT_STYLE_OPTIONS,
    DEFAULT_SPRITE_PARTS,
    buildSpriteId,
    parseSpriteParts,
    accessoryFromHairStyle,
} from "@/components/shared/pixel-avatar";
import type { OnboardingAvatar } from "@/lib/types";

type AvatarTab = "hair" | "clothes" | "head";

const AVATAR_TABS: Array<{
    id: AvatarTab;
    label: string;
}> = [
        { id: "hair", label: "Hair" },
        { id: "clothes", label: "Clothes" },
        { id: "head", label: "Skin" },
    ];

// accessoryFromHairStyle imported from pixel-avatar

interface AvatarCustomizerProps {
    avatar: OnboardingAvatar;
    onChange: (avatar: OnboardingAvatar) => void;
}

export function AvatarCustomizer({ avatar, onChange }: AvatarCustomizerProps) {
    const [avatarTab, setAvatarTab] = useState<AvatarTab>("hair");
    const spriteParts = parseSpriteParts(avatar.spriteId);

    const updateSpriteParts = useCallback(
        (next: Partial<SpriteParts>) => {
            const updatedParts = { ...spriteParts, ...next };
            const nextAvatar: OnboardingAvatar = {
                ...avatar,
                spriteId: buildSpriteId(updatedParts),
                accessory: next.hair ? accessoryFromHairStyle(next.hair as SpriteHairStyle) : avatar.accessory,
            };
            onChange(nextAvatar);
        },
        [avatar, onChange, spriteParts]
    );

    const resetSprite = useCallback(() => {
        const nextAvatar: OnboardingAvatar = {
            spriteId: buildSpriteId(DEFAULT_SPRITE_PARTS),
            paletteId: "plum",
            accessory: "none",
            expression: "calm",
        };
        onChange(nextAvatar);
    }, [onChange]);

    const spriteTabClass = "arcane-sprite-tab";
    const spriteTabActiveClass = "arcane-sprite-tab arcane-sprite-tab-active";
    const spriteTileClass = "arcane-sprite-tile group";
    const spriteTileSelectedClass = "arcane-sprite-tile arcane-sprite-tile-active group";

    return (
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-7">
            <div className="space-y-4 md:sticky md:top-6">
                <div className="arcane-frame rounded-2xl p-4">
                    <p className="arcane-kicker">Portrait Preview</p>
                    <div className="mt-2.5 flex min-h-[172px] items-center justify-center">
                        <PixelAvatar avatar={avatar} variant="front" size={136} />
                    </div>
                </div>
                <button
                    type="button"
                    onClick={resetSprite}
                    className="arcane-button-secondary inline-flex h-9 items-center justify-center rounded-full px-4 text-[11px] uppercase tracking-[0.16em]"
                    aria-label="Reset avatar"
                >
                    <Sparkles className="h-3 w-3" />
                    Reset
                </button>
            </div>

            <div className="pt-1">
                <p className="arcane-kicker inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-amber-300/90" />
                    Customize Your Wizard
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {AVATAR_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setAvatarTab(tab.id)}
                            aria-pressed={avatarTab === tab.id}
                            className={avatarTab === tab.id ? spriteTabActiveClass : spriteTabClass}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {avatarTab === "hair" && (
                    <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Style</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {HAIR_STYLE_OPTIONS.map((option) => {
                                const nextParts = { ...spriteParts, hair: option };
                                const candidate = {
                                    ...avatar,
                                    spriteId: buildSpriteId(nextParts),
                                    accessory: accessoryFromHairStyle(option),
                                };
                                const selected = spriteParts.hair === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => updateSpriteParts({ hair: option })}
                                        aria-pressed={selected}
                                        className={selected ? spriteTileSelectedClass : spriteTileClass}
                                    >
                                        <div className="flex items-center justify-center">
                                            <PixelAvatar avatar={candidate} size={52} />
                                        </div>
                                        <span className="arcane-sprite-label mt-1 block text-[11px] truncate w-full px-1">{option.replace("short-", "").replace("ponytail-", "")}</span>
                                        {selected && <span className="arcane-selected-chip">Selected</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {avatarTab === "clothes" && (
                    <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Color</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {OUTFIT_STYLE_OPTIONS.map((option) => {
                                const nextParts = { ...spriteParts, outfit: option };
                                const candidate = { ...avatar, spriteId: buildSpriteId(nextParts) };
                                const selected = spriteParts.outfit === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => updateSpriteParts({ outfit: option })}
                                        aria-pressed={selected}
                                        className={selected ? spriteTileSelectedClass : spriteTileClass}
                                    >
                                        <div className="flex items-center justify-center">
                                            <PixelAvatar avatar={candidate} size={52} />
                                        </div>
                                        <span className="arcane-sprite-label mt-1 block text-[11px] truncate w-full px-1">{option.replace("-vest", "").replace("-tunic", "").replace("-guard", "").replace("-leather", "").replace("-traveler", "")}</span>
                                        {selected && <span className="arcane-selected-chip">Selected</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {avatarTab === "head" && (
                    <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Skin Tone</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {HEAD_TONE_OPTIONS.map((option) => {
                                const nextParts = { ...spriteParts, head: option };
                                const candidate = { ...avatar, spriteId: buildSpriteId(nextParts) };
                                const selected = spriteParts.head === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => updateSpriteParts({ head: option })}
                                        aria-pressed={selected}
                                        className={selected ? spriteTileSelectedClass : spriteTileClass}
                                    >
                                        <div className="flex items-center justify-center">
                                            <PixelAvatar avatar={candidate} size={52} />
                                        </div>
                                        <span className="arcane-sprite-label mt-1 block text-[11px]">{option}</span>
                                        {selected && <span className="arcane-selected-chip">Selected</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
