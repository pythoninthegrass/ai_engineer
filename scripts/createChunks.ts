import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { generateObject } from "ai";
import { registry } from "../models";
import { z } from "zod";

const prisma = new PrismaClient();

// Schema for proposition transfers - self-contained facts for vector embedding
const PropositionSchema = z.object({
  propositions: z
    .array(
      z.object({
        content: z
          .string()
          .describe(
            "A self-contained, atomic fact or piece of information that can be understood independently"
          ),
        context: z
          .string()
          .describe(
            "Brief context about where this proposition came from or what it relates to"
          ),
        importance: z
          .enum(["high", "medium", "low"])
          .describe(
            "Relative importance of this proposition for understanding the document"
          ),
      })
    )
    .describe("Array of proposition transfers extracted from the page content"),
});

type PropositionResult = z.infer<typeof PropositionSchema>;

async function extractPropositionsFromPage(
  content: string,
  pageNumber: number,
  documentName: string
): Promise<PropositionResult> {
  try {
    const result = await generateObject({
      model: registry.languageModel("anthropic:sonnet-reasoning-with-schema"),
      schema: PropositionSchema,
      prompt: `You are tasked with breaking down document content into "proposition transfers" - atomic, self-contained facts that will be used for vector embedding and retrieval.

Document: ${documentName}
Page: ${pageNumber}

Content to analyze:
${content}

Instructions:
1. Extract every distinct fact, claim, data point, or piece of information
2. Each proposition should be completely self-contained and understandable without additional context
3. Include relevant context (dates, names, references) within each proposition
4. Avoid redundancy - each proposition should be unique
5. Focus on factual information rather than formatting or structural elements
6. Rate importance based on how central each fact is to understanding the document's purpose

Think carefully about how to break this content into the most useful, atomic facts for later retrieval.`,
    });

    return result.object;
  } catch (error) {
    console.error(
      `Error extracting propositions from page ${pageNumber}:`,
      error
    );
    return { propositions: [] };
  }
}

async function processDocumentPage(documentPage: any) {
  console.log(
    `Processing page ${documentPage.pageNumber} from document ID ${documentPage.documentId}`
  );

  try {
    // Get document name for context
    const document = await prisma.document.findUnique({
      where: { id: documentPage.documentId },
    });

    if (!document) {
      console.error(`Document not found for page ${documentPage.id}`);
      return;
    }

    // Extract propositions using Claude with thinking
    const propositions = await extractPropositionsFromPage(
      documentPage.content,
      documentPage.pageNumber,
      document.name
    );

    console.log(
      `Extracted ${propositions.propositions.length} propositions from page ${documentPage.pageNumber}`
    );

    // Save each proposition as a DocumentChunk
    for (const [index, proposition] of propositions.propositions.entries()) {
      if (proposition.content.trim()) {
        const chunk = await prisma.documentChunk.create({
          data: {
            pageNumber: documentPage.pageNumber,
            documentPageId: documentPage.id,
            content: `${proposition.content}\n\nContext: ${proposition.context}\nImportance: ${proposition.importance}`,
          },
        });

        console.log(
          `  Saved chunk ${index + 1}/${propositions.propositions.length}: ID ${
            chunk.id
          }`
        );
        console.log(`  Preview: ${proposition.content.slice(0, 100)}...`);
      }
    }

    // Add a small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error(`Error processing document page ${documentPage.id}:`, error);
  }
}

async function main() {
  try {
    // Get all document pages that don't already have chunks
    const documentPages = await prisma.documentPage.findMany({
      where: {
        DocumentChunk: {
          none: {},
        },
      },
      orderBy: [{ documentId: "asc" }, { pageNumber: "asc" }],
    });

    if (documentPages.length === 0) {
      console.log("No document pages found that need chunk processing");
      return;
    }

    console.log(`Found ${documentPages.length} document pages to process`);

    // Process each page
    for (const documentPage of documentPages) {
      await processDocumentPage(documentPage);
      console.log(`\n--- Completed page ${documentPage.pageNumber} ---\n`);
    }

    console.log("All document pages processed successfully!");

    // Summary statistics
    const totalChunks = await prisma.documentChunk.count();
    const totalPages = await prisma.documentPage.count();
    const totalDocuments = await prisma.document.count();

    console.log(`\n=== SUMMARY ===`);
    console.log(`Documents: ${totalDocuments}`);
    console.log(`Pages: ${totalPages}`);
    console.log(`Chunks: ${totalChunks}`);
    console.log(
      `Average chunks per page: ${(totalChunks / totalPages).toFixed(2)}`
    );
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
