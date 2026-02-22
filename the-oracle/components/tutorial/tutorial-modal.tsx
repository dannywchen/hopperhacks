"use client";

import { useState } from "react";
import Image from "next/image";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ClassicLoader from "@/components/ui/loader";
import { syncLocalSimulationStateToSupabase } from "@/lib/client/cloud-state";
import { saveSetup } from "@/lib/client/setup-store";
import type { UserSetup } from "@/lib/types";

type TutorialModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    setup: UserSetup | null;
    onComplete: (updatedSetup?: UserSetup) => void;
};

export function TutorialModal({ open, onOpenChange, setup, onComplete }: TutorialModalProps) {
    const needsExtraData =
        !setup?.onboarding?.resumeText &&
        !setup?.onboarding?.linkedinProfile &&
        (!setup?.onboarding?.interviewMessages || setup.onboarding.interviewMessages.length === 0);

    const [slide, setSlide] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state for Slide 4
    const [career, setCareer] = useState("");
    const [kids, setKids] = useState("");
    const [sleep, setSleep] = useState("");
    const [risk, setRisk] = useState("medium");
    const [social, setSocial] = useState("ambivert");

    const handleNext = async () => {
        if (slide === 2 && !needsExtraData) {
            setLoading(true);
            setError(null);
            try {
                const newSetup = setup ? { ...setup } : ({} as UserSetup);
                if (!newSetup.preferences) {
                    newSetup.preferences = {
                        horizonYears: 10,
                        simulationMode: "manual_step",
                        includeLongevity: false,
                        includeLovedOnesLongevity: false,
                    };
                }
                newSetup.preferences.hasCompletedTutorial = true;
                saveSetup(newSetup);
                await syncLocalSimulationStateToSupabase();
                onComplete(newSetup);
            } catch (err: any) {
                setError(err.message || "Failed to finalize tutorial.");
            } finally {
                setLoading(false);
            }
        } else {
            setSlide((s) => s + 1);
        }
    };

    const handleSaveData = async () => {
        if (!career || !kids || !sleep) {
            setError("Please answer all the required questions to continue.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const extraStory = `
Supplemental Memory Data:
- Career Path / Job desired: ${career}
- Thoughts on having kids: ${kids}
- Average hours of sleep: ${sleep}
- Risk tolerance: ${risk}
- Personality (Introvert/Extrovert): ${social}
      `.trim();

            const newSetup = setup ? { ...setup } : ({} as UserSetup);

            if (!newSetup.onboarding) {
                newSetup.onboarding = {
                    version: "v1",
                    completedAt: new Date().toISOString(),
                    avatar: { spriteId: "v3|head:beige|hair:short-brown|outfit:blue-guard", paletteId: "plum", accessory: "none", expression: "calm" },
                    lifeStory: extraStory,
                    interviewMessages: [],
                    reflections: [],
                    simulationMode: "manual_step",
                    simulationHorizonPreset: "10_years",
                };
            } else {
                newSetup.onboarding = {
                    ...newSetup.onboarding,
                    lifeStory: newSetup.onboarding.lifeStory
                        ? newSetup.onboarding.lifeStory + "\n\n" + extraStory
                        : extraStory
                };
            }

            if (!newSetup.preferences) {
                newSetup.preferences = {
                    horizonYears: 10,
                    simulationMode: "manual_step",
                    includeLongevity: false,
                    includeLovedOnesLongevity: false,
                };
            }
            newSetup.preferences.hasCompletedTutorial = true;

            saveSetup(newSetup);
            await syncLocalSimulationStateToSupabase();

            onComplete(newSetup);
        } catch (err: any) {
            setError(err.message || "Failed to save information.");
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            // Force the tutorial to be completed by blocking click-outside dismissals entirely
            if (!val) return;
            onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-[700px] bg-[#1a1c29] text-[#e0ddcf] border-[#b49e54] shadow-[0_0_30px_rgba(180,158,84,0.15)]" showCloseButton={false}>
                {slide === 0 && (
                    <div className="flex flex-col gap-6 p-2">
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-[#b49e54] font-serif tracking-wide text-center">How The Oracle Works</DialogTitle>
                            <DialogDescription className="text-[#a8a192] text-center italic font-serif">
                                Welcome to your life simulation. Let's walk through the basics.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-[#b49e54] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] bg-[#0d101a] flex items-center justify-center">
                                {/* Decorative Timeline Visual */}
                                <div className="flex items-center space-x-4 opacity-80 font-serif">
                                    <div className="w-12 h-12 rounded-full border-2 border-[#454e59] flex items-center justify-center font-bold text-[#a8a192]">1</div>
                                    <div className="w-16 h-px bg-[#454e59]"></div>
                                    <div className="w-12 h-12 rounded-full border-2 border-[#b49e54] bg-[#b49e54]/20 text-[#e0ddcf] flex items-center justify-center font-bold shadow-[0_0_15px_rgba(180,158,84,0.4)]">2</div>
                                    <div className="w-16 h-px bg-[#454e59]"></div>
                                    <div className="w-12 h-12 rounded-full border-2 border-[#454e59] flex items-center justify-center font-bold opacity-50 text-[#a8a192]">3</div>
                                </div>
                            </div>
                            <p className="text-[#c0baa6] text-center leading-relaxed font-serif text-lg">
                                <strong className="text-[#b49e54]">The Timeline:</strong> When you choose an action or write your own, it creates a new block on your timeline. You can click on past blocks to see exactly how your life metrics changed based on that decision.
                            </p>
                        </div>
                        <div className="flex justify-end mt-4">
                            <Button onClick={handleNext} className="bg-[#740001] hover:bg-[#ae0001] text-[#e0ddcf] border border-[#d3a625] px-8 font-serif shadow-[0_0_10px_rgba(116,0,1,0.5)] transition-all">
                                Next
                            </Button>
                        </div>
                    </div>
                )}

                {slide === 1 && (
                    <div className="flex flex-col gap-6 p-2">
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-[#b49e54] font-serif tracking-wide text-center">Your Life Metrics</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col items-center gap-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                {["Money", "Career", "Health", "Free Time"].map(m => (
                                    <div key={m} className="bg-[#11131c] border-2 border-[#2a623d] p-4 rounded-xl text-center shadow-[inset_0_0_15px_rgba(0,0,0,0.6)]">
                                        <p className="text-[#a8a192] text-sm font-medium mb-1 font-serif">{m}</p>
                                        <p className="text-[#e0ddcf] text-xl font-bold font-serif">85/100</p>
                                        <p className="text-[#b49e54] text-xs mt-1 font-serif tracking-widest">+2</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[#c0baa6] text-center leading-relaxed font-serif text-lg">
                                <strong className="text-[#b49e54]">Metrics panel:</strong> These numbers represent your current life state. Clicking into any metric will show trends, charts, and an explanation of the underlying data driving those numbers over time.
                            </p>
                        </div>
                        <div className="flex justify-between mt-4">
                            <Button onClick={() => setSlide(0)} variant="outline" className="bg-black text-white hover:bg-white hover:text-black border border-[#454e59] font-serif transition-colors">
                                Back
                            </Button>
                            <Button onClick={handleNext} className="bg-[#740001] hover:bg-[#ae0001] text-[#e0ddcf] border border-[#d3a625] px-8 font-serif shadow-[0_0_10px_rgba(116,0,1,0.5)] transition-all">
                                Next
                            </Button>
                        </div>
                    </div>
                )}

                {slide === 2 && (
                    <div className="flex flex-col gap-6 p-2">
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-[#b49e54] font-serif tracking-wide text-center">How To Play</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col items-center gap-6">
                            <div className="w-full flex flex-col gap-3">
                                {[
                                    "Take the high-paying job in a new city",
                                    "Stay and focus on building relationships",
                                    "Go back to school for a pivot"
                                ].map((opt, i) => (
                                    <div key={i} className="bg-[#11131c]/80 border border-[#b49e54]/30 p-3 rounded-lg flex items-center gap-3">
                                        <div className="bg-[#1a472a] text-[#aaaaaa] border border-[#2a623d] w-8 h-8 rounded shrink-0 flex items-center justify-center font-medium font-serif">A{i + 1}</div>
                                        <span className="text-[#e0ddcf] font-serif">{opt}</span>
                                    </div>
                                ))}
                                <div className="mt-2 bg-[#1a1c29] border-2 border-[#1a472a] p-4 rounded-lg shadow-[inset_0_0_15px_rgba(26,71,42,0.3)]">
                                    <p className="text-[#b49e54] text-sm mb-2 font-serif tracking-wider">Write Your Own (Custom Action):</p>
                                    <div className="bg-[#0b0c10] border border-[#2a2c39] h-10 rounded px-3 flex items-center text-[#888888] text-sm italic font-serif">
                                        Start a side hustle selling 3D printed models...
                                    </div>
                                </div>
                            </div>
                            <p className="text-[#c0baa6] text-center leading-relaxed font-serif text-lg">
                                For every step, the AI offers <strong className="text-[#b49e54]">3 curated options</strong> based on your current trajectory.
                                If you don't like any of them, you can <strong className="text-[#b49e54]">write your own custom action</strong> and see what happens to your life if you go down that path.
                            </p>
                        </div>
                        <div className="flex justify-between mt-4">
                            <Button onClick={() => setSlide(1)} variant="outline" className="bg-black text-white hover:bg-white hover:text-black border border-[#454e59] font-serif transition-colors">
                                Back
                            </Button>
                            <Button onClick={handleNext} disabled={loading} className="bg-[#740001] hover:bg-[#ae0001] text-[#e0ddcf] border border-[#d3a625] px-8 font-serif shadow-[0_0_10px_rgba(116,0,1,0.5)] transition-all">
                                {loading ? <ClassicLoader size="sm" /> : (needsExtraData ? "Next" : "Start Playing")}
                            </Button>
                        </div>
                    </div>
                )}

                {slide === 3 && (
                    <div className="flex flex-col gap-6 p-2">
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-[#b49e54] font-serif tracking-wide text-center">We Need a Bit More Info</DialogTitle>
                            <DialogDescription className="text-[#a8a192] text-center italic font-serif">
                                Because you skipped the setup, the Oracle has almost zero memory of you. To make your simulation accurate, please answer these 5 non-negotiable questions.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-3 custom-scrollbar">
                            <div className="space-y-2">
                                <Label htmlFor="career" className="text-[#c0baa6] font-serif text-lg">1. What career path or job do you want?</Label>
                                <Input id="career" value={career} onChange={e => setCareer(e.target.value)} placeholder="e.g. Software Engineer, Biologist, Nurse, etc." className="bg-[#11131c] border-[#b49e54]/50 focus:border-[#b49e54] text-[#e0ddcf] font-serif placeholder:text-[#555] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="kids" className="text-[#c0baa6] font-serif text-lg">2. Do you want to have kids?</Label>
                                <Input id="kids" value={kids} onChange={e => setKids(e.target.value)} placeholder="e.g. Yes, 2 kids in my 30s. Or: No, never." className="bg-[#11131c] border-[#b49e54]/50 focus:border-[#b49e54] text-[#e0ddcf] font-serif placeholder:text-[#555] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="sleep" className="text-[#c0baa6] font-serif text-lg">3. Average hours of sleep you get</Label>
                                <Input id="sleep" type="number" value={sleep} onChange={e => setSleep(e.target.value)} placeholder="e.g. 7" className="bg-[#11131c] border-[#b49e54]/50 focus:border-[#b49e54] text-[#e0ddcf] font-serif placeholder:text-[#555] shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]" />
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[#c0baa6] font-serif text-lg">4. Risk Tolerance</Label>
                                <RadioGroup value={risk} onValueChange={setRisk} className="flex gap-6">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="low" id="r1" className="border-[#b49e54] text-[#740001] data-[state=checked]:bg-[#740001]" />
                                        <Label htmlFor="r1" className="text-[#a8a192] font-serif cursor-pointer">Play it safe</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="medium" id="r2" className="border-[#b49e54] text-[#740001] data-[state=checked]:bg-[#740001]" />
                                        <Label htmlFor="r2" className="text-[#a8a192] font-serif cursor-pointer">Calculated</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="high" id="r3" className="border-[#b49e54] text-[#740001] data-[state=checked]:bg-[#740001]" />
                                        <Label htmlFor="r3" className="text-[#a8a192] font-serif cursor-pointer">Very risky</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            <div className="space-y-3 pb-2">
                                <Label className="text-[#c0baa6] font-serif text-lg">5. Personality</Label>
                                <RadioGroup value={social} onValueChange={setSocial} className="flex gap-6">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="introvert" id="s1" className="border-[#b49e54] text-[#740001] data-[state=checked]:bg-[#740001]" />
                                        <Label htmlFor="s1" className="text-[#a8a192] font-serif cursor-pointer">Introvert</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="ambivert" id="s2" className="border-[#b49e54] text-[#740001] data-[state=checked]:bg-[#740001]" />
                                        <Label htmlFor="s2" className="text-[#a8a192] font-serif cursor-pointer">Ambivert</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="extrovert" id="s3" className="border-[#b49e54] text-[#740001] data-[state=checked]:bg-[#740001]" />
                                        <Label htmlFor="s3" className="text-[#a8a192] font-serif cursor-pointer">Extrovert</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {error && <p className="text-[#ae0001] font-serif text-sm bg-[#ae0001]/10 border border-[#ae0001]/30 p-2 rounded">{error}</p>}
                        </div>

                        <div className="flex justify-between mt-2 pt-4 border-t border-[#454e59]">
                            <Button onClick={() => setSlide(2)} variant="outline" className="bg-black text-white hover:bg-white hover:text-black border border-[#454e59] font-serif transition-colors">
                                Back
                            </Button>
                            <Button onClick={handleSaveData} disabled={loading} className="bg-[#740001] hover:bg-[#ae0001] text-[#e0ddcf] border border-[#d3a625] px-8 font-serif shadow-[0_0_10px_rgba(116,0,1,0.5)] transition-all">
                                {loading ? <ClassicLoader size="sm" /> : "Save & Start"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
