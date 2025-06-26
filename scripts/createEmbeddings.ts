import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { embed } from "ai";
import { registry } from "../models";

const prisma = new PrismaClient();

async function generateEmbedding(content: string): Promise<number[]> {
  try {
    const result = await embed({
      model: registry.textEmbeddingModel("openai:small"),
      value: content,
    });

    return result.embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

async function processChunk(chunk: any) {
  console.log(`Processing chunk ${chunk.id} from page ${chunk.pageNumber}`);

  try {
    // Generate embedding for the chunk content
    const embedding = await generateEmbedding(chunk.content);

    console.log(`Generated embedding with ${embedding.length} dimensions`);

    // Update the chunk with the embedding using raw SQL
    await prisma.$executeRaw`
      UPDATE "DocumentChunk" 
      SET embedding = ${`[${embedding.join(",")}]`}::vector 
      WHERE id = ${chunk.id}
    `;

    console.log(`Updated chunk ${chunk.id} with embedding`);

    // Add a small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error(`Error processing chunk ${chunk.id}:`, error);
    throw error;
  }
}

async function processBatch(
  chunks: any[],
  batchNumber: number,
  totalBatches: number
) {
  console.log(
    `\n=== Processing Batch ${batchNumber}/${totalBatches} (${chunks.length} chunks) ===`
  );

  for (const [index, chunk] of chunks.entries()) {
    console.log(`Batch ${batchNumber}, Chunk ${index + 1}/${chunks.length}`);
    await processChunk(chunk);
  }

  console.log(`Completed batch ${batchNumber}`);

  // Longer delay between batches to respect rate limits
  if (batchNumber < totalBatches) {
    console.log("Waiting 2 seconds before next batch...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  try {
    // Get all document chunks that don't have embeddings using raw SQL
    const chunksWithoutEmbeddings = await prisma.$queryRaw<
      Array<{
        id: number;
        pageNumber: number;
        documentPageId: number;
        content: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT id, "pageNumber", "documentPageId", content, "createdAt", "updatedAt"
      FROM "DocumentChunk" 
      WHERE embedding IS NULL
      ORDER BY "documentPageId" ASC, "pageNumber" ASC, id ASC
    `;

    if (chunksWithoutEmbeddings.length === 0) {
      console.log("No chunks found that need embeddings");
      return;
    }

    console.log(
      `Found ${chunksWithoutEmbeddings.length} chunks that need embeddings`
    );

    // Process in batches to manage rate limits and memory
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(chunksWithoutEmbeddings.length / BATCH_SIZE);

    console.log(
      `Processing in ${totalBatches} batches of ${BATCH_SIZE} chunks each`
    );

    for (let i = 0; i < chunksWithoutEmbeddings.length; i += BATCH_SIZE) {
      const batch = chunksWithoutEmbeddings.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      await processBatch(batch, batchNumber, totalBatches);
    }

    console.log("\nAll chunks processed successfully!");

    // Summary statistics
    const totalChunks = await prisma.documentChunk.count();
    const chunksWithEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "DocumentChunk" WHERE embedding IS NOT NULL
    `;
    const chunksWithoutEmbeddingsResult = await prisma.$queryRaw<
      [{ count: bigint }]
    >`
      SELECT COUNT(*) as count FROM "DocumentChunk" WHERE embedding IS NULL
    `;

    const chunksWithEmbeddingsCount = Number(chunksWithEmbeddings[0].count);
    const chunksWithoutEmbeddingsCount = Number(
      chunksWithoutEmbeddingsResult[0].count
    );

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total chunks: ${totalChunks}`);
    console.log(`Chunks with embeddings: ${chunksWithEmbeddingsCount}`);
    console.log(`Chunks without embeddings: ${chunksWithoutEmbeddingsCount}`);
    const embeddingCoverage =
      totalChunks > 0
        ? ((chunksWithEmbeddingsCount / totalChunks) * 100).toFixed(1)
        : "0.0";
    console.log(`Embedding coverage: ${embeddingCoverage}%`);
  } catch (error) {
    console.error("Error in main function:", error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
