// https://ai-sdk.dev/docs/ai-sdk-core/provider-management
import { createProviderRegistry } from "ai";
import { anthropic } from "./anthropic";
import { gemini } from "./gemini";
import { openai } from "./openai";

const separator = ":";

const providers = {
  anthropic,
  gemini,
  openai,
};

export const registry = createProviderRegistry(
  {
    ...providers,
  },
  { separator }
);
