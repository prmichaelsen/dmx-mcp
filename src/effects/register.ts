import type { EffectEngine } from "./engine.js";
import { chaseCalculator } from "./chase.js";
import { rainbowCalculator } from "./rainbow.js";
import { strobeCalculator } from "./strobe.js";

export function registerBuiltInEffects(engine: EffectEngine): void {
  engine.registerEffect("chase", chaseCalculator);
  engine.registerEffect("rainbow", rainbowCalculator);
  engine.registerEffect("strobe", strobeCalculator);
}
