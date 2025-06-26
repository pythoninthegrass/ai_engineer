import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import type { JSONSchema7 } from "ai";
import {
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from "ai";
import { vertexCommonParams } from "./util/vertexCommonParams";
import { createOpenAI } from "@ai-sdk/openai";
import { OpenAIProviderOptions } from "@ai-sdk/openai/internal";

export const MAX_OUTPUT_TOKENS = 8192;
export const DEFAULT_TEMPERATURE = 0.1;

const baseOpenai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const openai = customProvider({
  languageModels: {
    "gpt-4.1-mini": wrapLanguageModel({
      model: baseOpenai("gpt-4.1-mini"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
        },
      }),
    }),

    "o3-mini": wrapLanguageModel({
      model: baseOpenai("o3-mini"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
          providerOptions: {
            openai: {
              reasoningEffort: "low",
            } satisfies OpenAIProviderOptions,
          },
        },
      }),
    }),
  },
  textEmbeddingModels: {
    small: baseOpenai.textEmbeddingModel("text-embedding-3-small"),
  },
});
