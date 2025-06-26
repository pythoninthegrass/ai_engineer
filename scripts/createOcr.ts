import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { generateText } from "ai";
import { registry } from "../models";
import { PDFDocument } from "pdf-lib";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function extractTextFromPdfPage(
  originalPdfDoc: PDFDocument,
  pageNumber: number
): Promise<string> {
  try {
    // Create a new PDF with just the single page
    const newPdfDoc = await PDFDocument.create();
    const copiedPages = await newPdfDoc.copyPages(originalPdfDoc, [
      pageNumber - 1,
    ]);
    copiedPages.forEach((page) => newPdfDoc.addPage(page));
    const singlePagePdfBytes = await newPdfDoc.save();

    const result = await generateText({
      model: registry.languageModel("gemini:flash"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please extract all text content from this PDF page. Return only the extracted text content, no additional formatting or commentary.`,
            },
            {
              type: "file",
              data: singlePagePdfBytes,
              mediaType: "application/pdf",
            },
          ],
        },
      ],
    });

    return result.text;
  } catch (error) {
    console.error(`Error extracting text from page ${pageNumber}:`, error);
    return "";
  }
}

async function processPdf(filePath: string, fileName: string) {
  console.log(`Processing PDF: ${fileName}`);

  // Read the PDF file
  const pdfBytes = readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();

  console.log(`PDF has ${pageCount} pages`);

  // Create document record
  const document = await prisma.document.upsert({
    where: { name: fileName },
    update: {},
    create: {
      name: fileName,
    },
  });

  console.log(`Created document record with ID: ${document.id}`);

  // Process each page
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    console.log(`Processing page ${pageNum}/${pageCount}`);

    try {
      // Extract text using Gemini Flash OCR
      const content = await extractTextFromPdfPage(pdfDoc, pageNum);

      if (content.trim()) {
        // Save page to database
        const documentPage = await prisma.documentPage.create({
          data: {
            pageNumber: pageNum,
            content: content.trim(),
            documentId: document.id,
          },
        });

        console.log(`Saved page ${pageNum} with ID: ${documentPage.id}`);
        console.log(`Content preview: ${content.slice(0, 100)}...`);
      } else {
        console.log(`Page ${pageNum} had no extractable text content`);
      }

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error processing page ${pageNum}:`, error);
    }
  }

  console.log(`Completed processing ${fileName}`);
}

async function main() {
  const docsDir = join(process.cwd(), "docs");

  try {
    // Get all PDF files from docs directory
    const files = readdirSync(docsDir).filter((file) =>
      file.toLowerCase().endsWith(".pdf")
    );

    if (files.length === 0) {
      console.log("No PDF files found in docs directory");
      return;
    }

    console.log(`Found ${files.length} PDF file(s): ${files.join(", ")}`);

    // Process each PDF file
    for (const file of files) {
      const filePath = join(docsDir, file);
      await processPdf(filePath, file);
      console.log(`\n--- Completed ${file} ---\n`);
    }

    console.log("All PDFs processed successfully!");
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
