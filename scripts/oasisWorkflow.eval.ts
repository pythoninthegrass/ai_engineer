import { Eval } from "braintrust";
import { ExactMatch } from "autoevals";
import {
  answerWithClaude,
  embedPrompt,
  findRelevantChunks,
  getContextText,
  QUESTION_PROMPT,
  TARGET_CHUNK_COUNT,
} from "./oasisWorkflow";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

Eval("AI Engineer", {
  data: async () => {
    const document = await prisma.document.findFirstOrThrow({
      select: { name: true },
    });

    const promptEmbedding = await embedPrompt(QUESTION_PROMPT);

    // Step 2: Find relevant chunks
    const relevantChunks = await findRelevantChunks(
      promptEmbedding,
      document.name,
      TARGET_CHUNK_COUNT
    );

    const contextText = getContextText(relevantChunks);
    return [
      {
        input: contextText,
        expected: {
          choice: "02",
          confidence: "high",
        },
      },
    ];
  },
  task: async (input) => {
    const result = await answerWithClaude(input);
    return {
      choice: result.choice,
      confidence: result.confidence,
    };
  },
  scores: [
    ({ input, output, expected }) => {
      return {
        name: "choiceMatched",
        score: output.choice === expected.choice ? 1 : 0,
      };
    },
    ({ input, output, expected }) => {
      return {
        name: "confidenceMatched",
        score: output.confidence === expected.confidence ? 1 : 0,
      };
    },
  ],
});
