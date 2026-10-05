import { defineAgent } from "eve";
export default defineAgent({
  model: "moonshotai/kimi-k3",
  reasoning: "high",
  modelOptions: {
    providerOptions: {
      gateway: {
        order: ["token-pass"],
        only: ["token-pass"],
      },
    },
  },
  defaultTools: false,
  tool: false,
  limits: {
    maxInputTokensPerSession: 250000,
    maxOutputTokensPerSession: 12000,
    maxTokenCostUsdPerSession: 0.5,
    sessionTimeoutMs: 86400000,
  },
});
