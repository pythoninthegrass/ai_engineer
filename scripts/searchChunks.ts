import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { embed } from "ai";
import { registry } from "../models";

const prisma = new PrismaClient();

// Hardcoded query for testing
const SEARCH_QUERY = "What are the patient's symptoms and diagnosis?";
const TOP_N_RESULTS = 5;

type SearchResult = {
  chunkId: number;
  pageNumber: number;
  documentId: number;
  documentName: string;
  chunkContent: string;
  similarity: number;
  createdAt: Date;
  updatedAt: Date;
};

async function embedQuery(query: string): Promise<number[]> {
  try {
    const result = await embed({
      model: registry.textEmbeddingModel("openai:small"),
      value: query,
    });

    return result.embedding;
  } catch (error) {
    console.error("Error embedding query:", error);
    throw error;
  }
}

async function searchSimilarChunks(
  queryEmbedding: number[],
  topN: number
): Promise<SearchResult[]> {
  try {
    const results = await prisma.$queryRaw<SearchResult[]>`
      SELECT 
        dc.id as "chunkId",
        dc."pageNumber",
        dc."documentPageId",
        dp."documentId",
        d.name as "documentName",
        dc.content as "chunkContent",
        1 - (dc.embedding <=> ${`[${queryEmbedding.join(
          ","
        )}]`}::vector) as similarity,
        dc."createdAt",
        dc."updatedAt"
      FROM "DocumentChunk" dc
      JOIN "DocumentPage" dp ON dc."documentPageId" = dp.id
      JOIN "Document" d ON dp."documentId" = d.id
      WHERE dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector ASC
      LIMIT ${topN}
    `;

    return results;
  } catch (error) {
    console.error("Error searching similar chunks:", error);
    throw error;
  }
}

function displayResults(query: string, results: SearchResult[]) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 SEARCH QUERY: "${query}"`);
  console.log(`📊 Found ${results.length} most similar chunks`);
  console.log(`${"=".repeat(80)}\n`);

  results.forEach((result, index) => {
    console.log(`📄 RESULT ${index + 1}/${results.length}`);
    console.log(`   Document: ${result.documentName}`);
    console.log(`   Page: ${result.pageNumber}`);
    console.log(`   Chunk ID: ${result.chunkId}`);
    console.log(`   Similarity: ${(result.similarity * 100).toFixed(2)}%`);
    console.log(`   Content Preview:`);

    // Display first few lines of content with proper formatting
    const contentLines = result.chunkContent.split("\n").slice(0, 5);
    contentLines.forEach((line) => {
      if (line.trim()) {
        console.log(`      ${line.trim()}`);
      }
    });

    if (result.chunkContent.split("\n").length > 5) {
      console.log(`      ... (content truncated)`);
    }

    console.log(`   Created: ${result.createdAt.toLocaleDateString()}`);
    console.log(`\n${"-".repeat(60)}\n`);
  });
}

async function getSearchStatistics() {
  try {
    const totalChunks = await prisma.documentChunk.count();
    const chunksWithEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "DocumentChunk" WHERE embedding IS NOT NULL
    `;
    const totalDocuments = await prisma.document.count();
    const totalPages = await prisma.documentPage.count();

    return {
      totalChunks,
      chunksWithEmbeddings: Number(chunksWithEmbeddings[0].count),
      totalDocuments,
      totalPages,
    };
  } catch (error) {
    console.error("Error getting search statistics:", error);
    return null;
  }
}

async function main() {
  try {
    console.log("🚀 Starting semantic search...\n");

    // Get database statistics
    const stats = await getSearchStatistics();
    if (stats) {
      console.log("📈 DATABASE STATISTICS:");
      console.log(`   Documents: ${stats.totalDocuments}`);
      console.log(`   Pages: ${stats.totalPages}`);
      console.log(`   Total Chunks: ${stats.totalChunks}`);
      console.log(`   Chunks with Embeddings: ${stats.chunksWithEmbeddings}`);
      console.log(
        `   Search Coverage: ${(
          (stats.chunksWithEmbeddings / stats.totalChunks) *
          100
        ).toFixed(1)}%\n`
      );
    }

    // Embed the search query
    console.log(`🔤 Embedding query: "${SEARCH_QUERY}"`);
    const queryEmbedding = await embedQuery(SEARCH_QUERY);
    console.log(
      `✅ Generated embedding with ${queryEmbedding.length} dimensions\n`
    );

    // Search for similar chunks
    console.log(`🔍 Searching for top ${TOP_N_RESULTS} most similar chunks...`);
    const results = await searchSimilarChunks(queryEmbedding, TOP_N_RESULTS);
    console.log(`✅ Found ${results.length} results\n`);

    // Display results
    if (results.length > 0) {
      displayResults(SEARCH_QUERY, results);

      // Additional insights
      const avgSimilarity =
        results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
      const topSimilarity = results[0]?.similarity || 0;

      console.log(`📊 SEARCH INSIGHTS:`);
      console.log(
        `   Best Match: ${(topSimilarity * 100).toFixed(2)}% similarity`
      );
      console.log(
        `   Average Similarity: ${(avgSimilarity * 100).toFixed(2)}%`
      );
      console.log(
        `   Documents Represented: ${
          new Set(results.map((r) => r.documentName)).size
        }`
      );
      console.log(
        `   Pages Represented: ${
          new Set(results.map((r) => `${r.documentName}-${r.pageNumber}`)).size
        }`
      );
    } else {
      console.log("❌ No results found. This might indicate:");
      console.log("   - No chunks have embeddings yet");
      console.log("   - The query is too specific");
      console.log("   - There might be an issue with the vector search");
    }
  } catch (error) {
    console.error("❌ Error in main function:", error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\n✅ Search completed successfully!");
  })
  .catch(async (e) => {
    console.error("❌ Search failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
