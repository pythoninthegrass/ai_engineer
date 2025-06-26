import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { embed, generateObject } from "ai";
import { registry } from "../models";
import { z } from "zod";

const prisma = new PrismaClient();

// OASIS GG0170K1 Question and Instructions
const OASIS_QUESTION = "OASIS GG0170K1";
export const QUESTION_PROMPT = `
OASIS GG0170K1 - Bed-to-Chair Transfer: Current ability to move safely from bed to chair or wheelchair.

Instructions for answering GG0170K1:
- This item assesses the patient's current ability to move from a lying position in bed to sitting on the side of the bed, stand, and sit down in a chair or wheelchair
- Code the patient's performance over the past 3 days using the most dependent level
- Consider use of assistive devices and human assistance
- Focus on safety and independence level

Response Options:
06 - Independent: Patient completes the activity by themselves with no assistance from a helper
05 - Setup or clean-up assistance: Helper sets up or cleans up; patient completes activity. Helper assists only prior to or following the activity.
04 - Supervision or touching assistance: Helper provides verbal cues and/or touching/steadying and/or contact guard assistance as patient completes activity. Assistance may be provided throughout the activity or intermittently.
03 - Partial/moderate assistance: Helper does less than half the effort. Helper lifts, holds or supports trunk or limbs, but provides less than half the effort.
02 - Substantial/maximal assistance: Helper does more than half the effort. Helper lifts or holds trunk or limbs and provides more than half the effort.
01 - Dependent: Helper does all of the effort. Patient does none of the effort to complete the activity. Or, the assistance of 2 or more helpers is required for the patient to complete the activity.
09 - Not applicable: Not attempted due to environmental limitations (e.g., lack of equipment, weather constraints) or medical restrictions.
10 - Not attempted due to safety concerns.
88 - Not attempted due to medical restriction or safety concerns.
`;

export const TARGET_CHUNK_COUNT = 20;

// Schema for Claude's answer
const OasisAnswerSchema = z.object({
  choice: z
    .string()
    .describe("The selected response option (e.g., '06', '05', '04', etc.)"),
  choiceDescription: z
    .string()
    .describe("Brief description of what the selected choice means"),
  explanation: z
    .string()
    .describe(
      "Detailed explanation of why this choice was selected based on the evidence"
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence level in this assessment"),
  keyEvidence: z
    .array(z.string())
    .describe(
      "Key pieces of evidence from the documentation that support this choice"
    ),
  alternativeConsidered: z
    .string()
    .optional()
    .describe("Alternative choice that was considered and why it was rejected"),
});

// Schema for OpenAI's grading
const GradingSchema = z.object({
  passable: z.boolean().describe("Whether the answer is acceptable/passable"),
  score: z.number().min(0).max(100).describe("Numerical score out of 100"),
  notes: z.string().describe("Detailed feedback on the quality of the answer"),
  strengths: z.array(z.string()).describe("Strengths of the answer"),
  weaknesses: z.array(z.string()).describe("Areas for improvement"),
  evidenceQuality: z
    .enum(["excellent", "good", "fair", "poor"])
    .describe("Quality of evidence used"),
});

type OasisAnswer = z.infer<typeof OasisAnswerSchema>;
type GradingResult = z.infer<typeof GradingSchema>;

type SearchResult = {
  chunkId: number;
  pageNumber: number;
  documentId: number;
  documentName: string;
  chunkContent: string;
  similarity: number;
};

export async function embedPrompt(prompt: string): Promise<number[]> {
  try {
    const result = await embed({
      model: registry.textEmbeddingModel("openai:small"),
      value: prompt,
    });
    return result.embedding;
  } catch (error) {
    console.error("Error embedding prompt:", error);
    throw error;
  }
}

export async function findRelevantChunks(
  promptEmbedding: number[],
  documentName: string,
  topN: number
): Promise<SearchResult[]> {
  try {
    const results = await prisma.$queryRaw<SearchResult[]>`
      SELECT 
        dc.id as "chunkId",
        dc."pageNumber",
        dp."documentId",
        d.name as "documentName",
        dc.content as "chunkContent",
        1 - (dc.embedding <=> ${`[${promptEmbedding.join(
          ","
        )}]`}::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "DocumentPage" dp ON dc."documentPageId" = dp.id
      JOIN "Document" d ON dp."documentId" = d.id
      WHERE dc.embedding IS NOT NULL 
        AND d.name = ${documentName}
      ORDER BY dc.embedding <=> ${`[${promptEmbedding.join(",")}]`}::vector ASC
      LIMIT ${topN}
    `;

    return results;
  } catch (error) {
    console.error("Error finding relevant chunks:", error);
    throw error;
  }
}

export function getContextText(contextChunks: SearchResult[]) {
  return contextChunks
    .map(
      (chunk, index) =>
        `--- Document Context ${index + 1} (Page ${
          chunk.pageNumber
        }, Similarity: ${(chunk.similarity * 100).toFixed(1)}%) ---\n${
          chunk.chunkContent
        }\n`
    )
    .join("\n");
}

export async function answerWithClaude(
  contextText: string
): Promise<OasisAnswer> {
  try {
    const result = await generateObject({
      model: registry.languageModel("anthropic:sonnet-reasoning-with-schema"),
      schema: OasisAnswerSchema,
      prompt: `You are a healthcare assessment expert specializing in OASIS (Outcome and Assessment Information Set) documentation.

${QUESTION_PROMPT}

Based on the following patient documentation, determine the most appropriate response for this OASIS item:

${contextText}

Instructions:
1. Carefully read through all the provided documentation
2. Look for specific evidence about the patient's bed-to-chair transfer abilities
3. Consider the patient's level of independence, need for assistance, and safety concerns
4. Match the evidence to the most appropriate response option
5. Provide a clear explanation with specific references to the documentation
6. Include your confidence level and key supporting evidence

Remember: Use the most dependent level observed over the past 3 days, and prioritize safety considerations.`,
    });

    return result.object;
  } catch (error) {
    console.error("Error getting answer from Claude:", error);
    throw error;
  }
}

async function gradeAnswerWithOpenAI(
  questionPrompt: string,
  contextChunks: SearchResult[],
  claudeAnswer: OasisAnswer
): Promise<GradingResult> {
  try {
    const contextText = contextChunks
      .map(
        (chunk, index) =>
          `--- Context ${index + 1} ---\n${chunk.chunkContent}\n`
      )
      .join("\n");

    const result = await generateObject({
      model: registry.languageModel("openai:gpt-4.1-mini"),
      schema: GradingSchema,
      prompt: `You are an expert healthcare documentation reviewer specializing in OASIS assessments. 

Your task is to grade the quality of an OASIS assessment answer.

ORIGINAL QUESTION:
${questionPrompt}

PATIENT DOCUMENTATION:
${contextText}

ANSWER TO EVALUATE:
Choice: ${claudeAnswer.choice} - ${claudeAnswer.choiceDescription}
Explanation: ${claudeAnswer.explanation}
Confidence: ${claudeAnswer.confidence}
Key Evidence: ${claudeAnswer.keyEvidence.join("; ")}
${
  claudeAnswer.alternativeConsidered
    ? `Alternative Considered: ${claudeAnswer.alternativeConsidered}`
    : ""
}

GRADING CRITERIA:
1. Accuracy: Does the chosen response option align with the evidence in the documentation?
2. Evidence Quality: Is the supporting evidence relevant, specific, and sufficient?
3. Clinical Reasoning: Is the explanation logical and demonstrates understanding of OASIS guidelines?
4. Completeness: Does the answer address all relevant aspects of the assessment?
5. Safety Considerations: Are safety concerns properly identified and addressed?

Provide a thorough evaluation with specific feedback on strengths and areas for improvement.`,
    });

    return result.object;
  } catch (error) {
    console.error("Error grading answer with OpenAI:", error);
    throw error;
  }
}

function displayWorkflowResults(
  documentName: string,
  chunks: SearchResult[],
  answer: OasisAnswer,
  grading: GradingResult
) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`🏥 OASIS ASSESSMENT WORKFLOW RESULTS`);
  console.log(`${"=".repeat(100)}\n`);

  console.log(`📋 QUESTION: ${OASIS_QUESTION}`);
  console.log(`📄 DOCUMENT: ${documentName}`);
  console.log(`🔍 CHUNKS ANALYZED: ${chunks.length}`);
  console.log(
    `📊 SIMILARITY RANGE: ${(
      chunks[chunks.length - 1]?.similarity * 100
    ).toFixed(1)}% - ${(chunks[0]?.similarity * 100).toFixed(1)}%\n`
  );

  console.log(`${"=".repeat(50)}`);
  console.log(`🤖 CLAUDE'S ASSESSMENT`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Choice: ${answer.choice} - ${answer.choiceDescription}`);
  console.log(`Confidence: ${answer.confidence.toUpperCase()}`);
  console.log(`\nExplanation:`);
  console.log(`${answer.explanation}\n`);
  console.log(`Key Evidence:`);
  answer.keyEvidence.forEach((evidence, index) => {
    console.log(`  ${index + 1}. ${evidence}`);
  });
  if (answer.alternativeConsidered) {
    console.log(`\nAlternative Considered:`);
    console.log(`${answer.alternativeConsidered}`);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`🎯 OPENAI'S GRADING`);
  console.log(`${"=".repeat(50)}`);
  console.log(
    `Status: ${grading.passable ? "✅ PASSABLE" : "❌ NOT PASSABLE"}`
  );
  console.log(`Score: ${grading.score}/100`);
  console.log(`Evidence Quality: ${grading.evidenceQuality.toUpperCase()}`);
  console.log(`\nDetailed Feedback:`);
  console.log(`${grading.notes}\n`);

  if (grading.strengths.length > 0) {
    console.log(`Strengths:`);
    grading.strengths.forEach((strength, index) => {
      console.log(`  ✅ ${strength}`);
    });
    console.log();
  }

  if (grading.weaknesses.length > 0) {
    console.log(`Areas for Improvement:`);
    grading.weaknesses.forEach((weakness, index) => {
      console.log(`  🔄 ${weakness}`);
    });
    console.log();
  }
}

async function main() {
  try {
    console.log("🚀 Starting OASIS Assessment Workflow...\n");

    // Get available documents
    const documents = await prisma.document.findMany({
      select: { name: true },
    });

    if (documents.length === 0) {
      console.log("❌ No documents found in database");
      return;
    }

    console.log("📚 Available documents:");
    documents.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc.name}`);
    });

    // Use the first document for this example
    const targetDocument = documents[0].name;
    console.log(`\n🎯 Using document: ${targetDocument}\n`);

    // Step 1: Embed the prompt
    console.log("🔤 Step 1: Embedding question prompt...");
    const promptEmbedding = await embedPrompt(QUESTION_PROMPT);
    console.log(
      `✅ Generated embedding with ${promptEmbedding.length} dimensions\n`
    );

    // Step 2: Find relevant chunks
    console.log(
      `🔍 Step 2: Finding top ${TARGET_CHUNK_COUNT} relevant chunks...`
    );
    const relevantChunks = await findRelevantChunks(
      promptEmbedding,
      targetDocument,
      TARGET_CHUNK_COUNT
    );
    console.log(`✅ Found ${relevantChunks.length} relevant chunks\n`);

    if (relevantChunks.length === 0) {
      console.log(
        "❌ No relevant chunks found. Check if embeddings exist for this document."
      );
      return;
    }

    // Step 3: Get answer from Claude
    console.log("🧠 Step 3: Getting assessment from Claude with thinking...");
    const contextText = getContextText(relevantChunks);
    const claudeAnswer = await answerWithClaude(contextText);
    console.log("✅ Claude provided assessment\n");

    // Step 4: Grade with OpenAI
    console.log("🎯 Step 4: Grading answer with OpenAI...");
    const gradingResult = await gradeAnswerWithOpenAI(
      QUESTION_PROMPT,
      relevantChunks,
      claudeAnswer
    );
    console.log("✅ OpenAI completed grading\n");

    // Step 5: Display results
    displayWorkflowResults(
      targetDocument,
      relevantChunks,
      claudeAnswer,
      gradingResult
    );
  } catch (error) {
    console.error("❌ Error in workflow:", error);
    throw error;
  }
}

// main()
//   .then(async () => {
//     await prisma.$disconnect();
//     console.log("\n✅ OASIS Assessment Workflow completed successfully!");
//   })
//   .catch(async (e) => {
//     console.error("❌ Workflow failed:", e);
//     await prisma.$disconnect();
//     process.exit(1);
//   });
