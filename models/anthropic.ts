import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import type { JSONSchema7 } from "ai";
import {
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from "ai";
import { vertexCommonParams } from "./util/vertexCommonParams";

export const MAX_OUTPUT_TOKENS = 8192;
export const DEFAULT_THINKING_BUDGET_TOKENS = 8000;
export const DEFAULT_TEMPERATURE = 0.1;

const vertexAnthropic = createVertexAnthropic(vertexCommonParams);

export const anthropic = customProvider({
  languageModels: {
    haiku: wrapLanguageModel({
      model: vertexAnthropic("claude-3-5-haiku"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
        },
      }),
    }),

    sonnet: wrapLanguageModel({
      model: vertexAnthropic("claude-sonnet-4"),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
        },
      }),
    }),

    "sonnet-reasoning-with-schema": wrapLanguageModel({
      model: vertexAnthropic("claude-sonnet-4"),
      middleware: [
        defaultSettingsMiddleware({
          settings: {
            // claude thinking does not allow setting temperature, so we can't set it here
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            providerOptions: {
              anthropic: {
                thinking: {
                  type: "enabled",
                  budgetTokens: DEFAULT_THINKING_BUDGET_TOKENS,
                },
              } satisfies AnthropicProviderOptions,
            },
          },
        }),

        {
          transformParams: ({ params }) => {
            // we grab the schema and turn it to an optional tool call, but direct the llm to use the tool
            // this is because forcing tool choice with thinking doesn't work
            params.toolChoice = { type: "auto" };
            params.tools = [
              {
                type: "function",
                description: "Respond with a JSON object.",
                inputSchema: (params.responseFormat as { schema: JSONSchema7 })
                  ?.schema,
                name: "json",
              },
            ];
            params.responseFormat = {
              type: "text",
            };
            params.prompt.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Once you have your answer, please use the json tool to provide it. No other text is needed.",
                },
              ],
              providerOptions: undefined,
            });
            return Promise.resolve(params);
          },
          wrapGenerate: async ({ doGenerate }) => {
            const result = await doGenerate();

            // we grab the tool call and transform it to a text response so it get's parsed
            const toolCall = result.content.map((m) => {
              if (m.type === "tool-call") {
                return { type: "text" as const, text: m.input };
              }
              return m;
            });
            return {
              ...result,
              content: toolCall,
            };
          },
        },
      ],
    }),
  },
});
