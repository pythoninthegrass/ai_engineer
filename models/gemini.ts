import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import {
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from "ai";
import { vertexCommonParams } from "./util/vertexCommonParams";

export const MAX_OUTPUT_TOKENS = 20000;
export const DEFAULT_THINKING_BUDGET_TOKENS = 8000;
export const MINIMUM_THINKING_BUDGET_TOKENS = 128;
export const MAXIMUM_THINKING_BUDGET_TOKENS = 32768;
export const DEFAULT_TEMPERATURE = 0.1;

const categories = [
  "HARM_CATEGORY_UNSPECIFIED",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
] as const;

const safetySettings = categories.map((category) => ({
  category,
  threshold: "BLOCK_NONE" as const,
}));

const vertex = createVertex(vertexCommonParams);

export const gemini = customProvider({
  languageModels: {
    flash: wrapLanguageModel({
      model: vertex("gemini-2.5-flash"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
          providerOptions: {
            google: {
              safetySettings,
              thinkingConfig: {
                includeThoughts: false,
                thinkingBudget: 0,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          },
        },
      }),
    }),

    pro: wrapLanguageModel({
      model: vertex("gemini-2.5-pro"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
          providerOptions: {
            google: {
              safetySettings,
              thinkingConfig: {
                includeThoughts: false,
                thinkingBudget: MINIMUM_THINKING_BUDGET_TOKENS,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          },
        },
      }),
    }),

    "flash-reasoning": wrapLanguageModel({
      model: vertex("gemini-2.5-flash"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
          providerOptions: {
            google: {
              safetySettings,
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: DEFAULT_THINKING_BUDGET_TOKENS,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          },
        },
      }),
    }),

    "pro-reasoning": wrapLanguageModel({
      model: vertex("gemini-2.5-pro"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
          providerOptions: {
            google: {
              safetySettings,
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: DEFAULT_THINKING_BUDGET_TOKENS,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          },
        },
      }),
    }),
  },
});
