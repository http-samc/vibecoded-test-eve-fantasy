import { defineAgent } from "eve";
export default defineAgent({
  model: "moonshotai/kimi-k3",
  reasoning: "high",
  defaultTools: false,
  tool: false,
  limits: {
    maxInputTokensPerSession: 250000,
    maxOutputTokensPerSession: 12000,
    maxTokenCostUsdPerSession: false,
    sessionTimeoutMs: 86400000,
  },
});
