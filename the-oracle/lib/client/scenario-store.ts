"use client";

const STORAGE_KEY_V2 = "deep-sim.scenarios.v2";
const STORAGE_KEY_V3 = "deep-sim.scenarios.v3";

export function clearScenarios() {
  globalThis?.localStorage?.removeItem(STORAGE_KEY_V2);
  globalThis?.localStorage?.removeItem(STORAGE_KEY_V3);
}
