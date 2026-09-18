import { defineAgent } from "eve";
export default defineAgent({
  model: "openai/gpt-5.6-terra",
  reasoning: "medium",
  defaultTools: false,
  tool: false,
  limits: {
    maxInputTokensPerSession: 80000,
    maxOutputTokensPerSession: 12000,
    maxTokenCostUsdPerSession: 0.5,
    sessionTimeoutMs: 86400000,
  },
});
