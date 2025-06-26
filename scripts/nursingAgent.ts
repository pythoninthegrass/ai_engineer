import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { embed, generateText, stepCountIs, tool } from "ai";
import { registry } from "../models";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const prisma = new PrismaClient();

// Example nurse query - you can change this
const NURSE_QUERY =
  "Does the patient have any wounds? If so, how many and which one is the latest?";

type SearchResult = {
  chunkId: number;
  pageNumber: number;
  documentId: number;
  documentName: string;
  chunkContent: string;
  similarity: number;
};

type SourcePageResult = {
  pageId: number;
  pageNumber: number;
  documentName: string;
  fullContent: string;
  createdAt: Date;
  updatedAt: Date;
};

// RAG Search Tool
const ragSchema = z.object({
  query: z
    .string()
    .describe("The search query to find relevant patient documentation"),
});

const ragOutputSchema = z.object({
  results: z.array(
    z.object({
      chunkId: z.number(),
      document: z.string(),
      page: z.number(),
      similarity: z.string(),
      content: z.string(),
    })
  ),
  summary: z.string(),
});

const ragSearchTool = tool({
  description:
    "Search through patient documentation and medical records using semantic similarity. " +
    "Use this when the nurse is asking about specific patient information, medical conditions, " +
    "treatments, or anything that might be documented in patient records.",
  inputSchema: ragSchema,
  outputSchema: ragOutputSchema,
  execute: async ({ query }) => {
    console.log(`🔍 RAG Search: "${query}"`);

    // Embed the query
    const result = await embed({
      model: registry.textEmbeddingModel("openai:small"),
      value: query,
    });

    const queryEmbedding = result.embedding;

    const searchQuery = `
          SELECT 
            dc.id as "chunkId",
            dc."pageNumber",
            dp."documentId",
            d.name as "documentName",
            dc.content as "chunkContent",
            1 - (dc.embedding <=> $1::vector) as similarity
          FROM "DocumentChunk" dc
          JOIN "DocumentPage" dp ON dc."documentPageId" = dp.id
          JOIN "Document" d ON dp."documentId" = d.id
          WHERE dc.embedding IS NOT NULL
          ORDER BY dc.embedding <=> $1::vector ASC
          LIMIT $2
        `;

    const topResults = 20;

    const results = await prisma.$queryRawUnsafe<SearchResult[]>(
      searchQuery,
      `[${queryEmbedding.join(",")}]`,
      topResults
    );

    console.log(`✅ Found ${results.length} relevant chunks`);

    return {
      results: results.map((r) => ({
        chunkId: r.chunkId,
        document: r.documentName,
        page: r.pageNumber,
        similarity: `${(r.similarity * 100).toFixed(1)}%`,
        content:
          r.chunkContent.slice(0, 500) +
          (r.chunkContent.length > 500 ? "..." : ""),
      })),
      summary: `Found ${
        results.length
      } relevant chunks with similarities ranging from ${(
        results[results.length - 1]?.similarity * 100
      ).toFixed(1)}% to ${(results[0]?.similarity * 100).toFixed(1)}%`,
    };
  },
});

const sourcePageSchema = z.object({
  chunkId: z.number().describe("The chunk ID to get the source page for"),
});

const sourcePageOutputSchema = z.object({
  pageId: z.number(),
  document: z.string(),
  pageNumber: z.number(),
  fullContent: z.string(),
  createdAt: z.string(),
  summary: z.string(),
});

// Get Source Page Tool
const getSourcePageTool = tool({
  description:
    "Retrieve the full original page content for a specific chunk ID. " +
    "Use this when you need more context around a specific piece of information " +
    "found in the RAG search results.",
  inputSchema: sourcePageSchema,
  outputSchema: sourcePageOutputSchema,
  execute: async ({ chunkId }) => {
    console.log(`📄 Getting source page for chunk ID: ${chunkId}`);

    const result = await prisma.$queryRaw<SourcePageResult[]>`
      SELECT 
        dp.id as "pageId",
        dp."pageNumber",
        d.name as "documentName",
        dp.content as "fullContent",
        dp."createdAt",
        dp."updatedAt"
      FROM "DocumentChunk" dc
      JOIN "DocumentPage" dp ON dc."documentPageId" = dp.id
      JOIN "Document" d ON dp."documentId" = d.id
      WHERE dc.id = ${chunkId}
    `;

    const page = result[0];
    console.log(
      `✅ Retrieved page ${page.pageNumber} from ${page.documentName}`
    );

    return {
      pageId: page.pageId,
      document: page.documentName,
      pageNumber: page.pageNumber,
      fullContent: page.fullContent,
      createdAt: page.createdAt.toISOString(),
      summary: `Full content from page ${page.pageNumber} of ${page.documentName} (${page.fullContent.length} characters)`,
    };
  },
});

const webSearchSchema = z.object({
  query: z
    .string()
    .describe(
      "The search query for finding current medical/healthcare information online"
    ),
});

const webSearchOutputSchema = z.object({
  searchResults: z.string(),
  sources: z.array(z.any()),
  summary: z.string(),
});

// Web Search Tool
const webSearchTool = tool({
  description:
    "Search the internet for current medical information, best practices, guidelines, or general healthcare knowledge. " +
    "Use this for questions about general medical knowledge, current guidelines, drug information, " +
    "or when patient documentation doesn't contain the needed information.",
  inputSchema: webSearchSchema,
  outputSchema: webSearchOutputSchema,
  execute: async ({ query }) => {
    console.log(`🌐 Web Search: "${query}"`);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: `Search for: ${query}`,
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: "high",
        }),
      },
      toolChoice: { type: "tool", toolName: "web_search_preview" },
    });

    console.log(`✅ Web search completed`);

    return {
      searchResults: result.text,
      sources: result.sources || [],
      summary: `Found ${
        result.sources?.length || 0
      } web sources with current information`,
    };
  },
});

async function runNursingAgent(userQuery: string) {
  try {
    console.log("🏥 Starting Nursing Assistant Agent...\n");
    console.log(`👩‍⚕️ Nurse Query: "${userQuery}"\n`);

    const result = await generateText({
      model: registry.languageModel("openai:o3-mini"),
      toolChoice: "auto",
      stopWhen: stepCountIs(10),
      tools: {
        ragSearch: ragSearchTool,
        getSourcePage: getSourcePageTool,
        webSearch: webSearchTool,
      },

      system: `You are an intelligent nursing assistant agent with access to patient documentation and web search capabilities. The nurse is asking a question about the patient, and you should try to generate the most helpful text based response possible.

Your role is to help nurses by:
1. Searching through patient documentation for specific patient information
2. Retrieving full source pages when more context is needed
3. Searching the internet for current medical guidelines, best practices, and general healthcare knowledge

Decision-making guidelines:
- Use RAG search for questions about specific patients, treatments in documentation, or documented conditions
- Use getSourcePage when you need more context around a specific chunk from RAG search
- Use web search for general medical knowledge, current guidelines, drug information, or when documentation doesn't have the answer
- Combine tools as needed to provide comprehensive answers
- Always prioritize patient safety and evidence-based information

When responding:
- Be clear and concise
- Cite your sources (document pages or web sources)
- Distinguish between patient-specific information and general medical knowledge
- Provide actionable guidance when appropriate
- If information is missing, clearly state what additional information would be needed`,
      prompt: userQuery,
    });

    console.log(`\n${"=".repeat(100)}`);
    console.log(`🏥 NURSING ASSISTANT RESPONSE`);
    console.log(`${"=".repeat(100)}\n`);

    console.log(`📝 RESPONSE:`);
    console.log(result.text);
    return result;
  } catch (error) {
    console.error("Error running nursing agent:", error);
    throw error;
  }
}

async function main() {
  try {
    // Get database statistics
    const stats = await prisma.documentChunk.count();
    const docs = await prisma.document.count();

    console.log(`📈 SYSTEM STATUS:`);
    console.log(`  Documents in database: ${docs}`);
    console.log(`  Chunks available for search: ${stats}`);
    console.log();

    // Run the nursing agent
    const result = await runNursingAgent(NURSE_QUERY);
  } catch (error) {
    console.error("❌ Error in main function:", error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\n✅ Nursing Assistant Agent completed successfully!");
  })
  .catch(async (e) => {
    console.error("❌ Agent failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
