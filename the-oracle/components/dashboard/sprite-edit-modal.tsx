"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AvatarCustomizer } from "@/components/shared/avatar-customizer";
import { OnboardingAvatar, UserSetup } from "@/lib/types";
import { saveSetup } from "@/lib/client/setup-store";
import { syncLocalSimulationStateToSupabase } from "@/lib/client/cloud-state";
import { Loader } from "@/components/ui/loader";

interface SpriteEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    setup: UserSetup | null;
    onSetupUpdate: (setup: UserSetup) => void;
}

export function SpriteEditModal({
    isOpen,
    onClose,
    setup,
    onSetupUpdate,
}: SpriteEditModalProps) {
    const [currentAvatar, setCurrentAvatar] = useState<OnboardingAvatar | null>(
        setup?.onboarding?.avatar ?? null
    );
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!setup || !currentAvatar) return;

        setIsSaving(true);
        setError(null);

        try {
            const updatedSetup: UserSetup = {
                ...setup,
                onboarding: {
                    ...setup.onboarding,
                    avatar: currentAvatar,
                } as any, // Cast to any because onboarding properties might vary
                updatedAt: new Date().toISOString(),
            };

            // 1. Update local store
            saveSetup(updatedSetup);

            // 2. Sync to Supabase
            await syncLocalSimulationStateToSupabase();

            // 3. Notify parent
            onSetupUpdate(updatedSetup);

            onClose();
        } catch (err: any) {
            setError(err?.message ?? "Failed to save avatar.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!setup || !currentAvatar) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl border-white/10 bg-zinc-950 p-6 text-zinc-100 sm:p-8">
                <DialogHeader>
                    <DialogTitle className="arcane-display-title text-2xl">
                        Refine Your Oracle Sprite
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-6">
                    <AvatarCustomizer
                        avatar={currentAvatar}
                        onChange={setCurrentAvatar}
                    />
                </div>

                {error && (
                    <p className="mt-4 text-sm text-red-400">{error}</p>
                )}

                <div className="mt-8 flex justify-end gap-3">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-100"
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="min-w-[100px] bg-white font-bold uppercase text-black hover:bg-zinc-200"
                    >
                        {isSaving ? <Loader size="sm" /> : "Save Changes"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
