"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Press_Start_2P } from "next/font/google";
import { History, Zap } from "lucide-react";

const retroFont = Press_Start_2P({
    subsets: ["latin"],
    weight: ["400"],
});

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const tabs = [
        {
            name: "ALL",
            href: "/dashboard/all",
            icon: History,
            active: pathname === "/dashboard/all" || pathname === "/dashboard/all/",
        },
        {
            name: "LIVE",
            href: "/dashboard",
            icon: Zap,
            active: pathname === "/dashboard" || pathname === "/dashboard/",
        },
    ];

    return (
        <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
            {/* Creative Notch - Responsive Position */}
            <div className="fixed bottom-6 top-auto sm:bottom-auto sm:top-0 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300">
                <div className="flex items-center gap-8 px-8 py-3 rounded-2xl sm:rounded-t-none sm:rounded-b-2xl border-2 sm:border-x-2 sm:border-b-2 sm:border-t-0 border-[#8b5a2b]/30 bg-[#2d1e18] shadow-[0_0_20px_rgba(0,0,0,0.5)] sm:shadow-[0_0_15px_rgba(139,90,43,0.1)]">
                    <div className="flex gap-8">
                        {tabs.map((tab) => (
                            <Link
                                key={tab.name}
                                href={tab.href}
                                className={`flex items-center gap-2 transition-all relative group ${tab.active
                                    ? "text-white"
                                    : "text-[#8b5a2b]/60 hover:text-white"
                                    }`}
                            >
                                <span className={`${retroFont.className} text-[8px] tracking-widest`}>
                                    {tab.name === "ALL" ? "ALL GAMES" : "CURRENT GAME"}
                                </span>
                                {tab.active && (
                                    <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-[#d3a625]/50" />
                                )}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen h-dvh overflow-hidden pt-16">
                {children}
            </div>
        </div>
    );
}
