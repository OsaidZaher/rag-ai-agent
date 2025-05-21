import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { pipeline } from "@xenova/transformers";

// Pinecone config
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const index = pc.index("firstres");

// Embedding function
let embed: any = null;
let embeddingModelLoaded = false;

async function getEmbedding(text: string): Promise<number[]> {
  try {
    if (!embed) {
      console.log("Loading embedding model for query...");
      embed = await pipeline(
        "feature-extraction",
        "Xenova/multilingual-e5-large"
      );
      embeddingModelLoaded = true;
      console.log("✅ Embedding model loaded successfully");
    }

    // Use "passage:" prefix for consistency with upsert script
    const output = await embed("passage: " + text, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data as number[]);
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
    return embedding;
  } catch (error) {
    console.error("❌ Error generating embedding:", error);
    throw new Error("Failed to generate embedding for query");
  }
}

// Enhanced restaurant context
const restaurantContext = `
You are a helpful assistant for "Gourmet Delight" restaurant. 

IMPORTANT INSTRUCTIONS:
- ONLY use information from the provided restaurant data and menu items
- If asked about items not in the menu, clearly state they are not available
- Always mention prices when discussing menu items
- Be friendly and helpful
- If you don't have specific information, say so clearly
- Do not make up or hallucinate menu items, prices, or restaurant details

Your restaurant specializes in fine dining with lunch and dinner options.
`;

const openaiInstance = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": "Restaurant Assistant",
  },
});

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Processing chat request...");

    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const userMessage = messages[messages.length - 1]?.content || "";
    console.log("👤 User message:", userMessage.substring(0, 100) + "...");

    if (!userMessage.trim()) {
      return NextResponse.json(
        { error: "Empty message provided" },
        { status: 400 }
      );
    }

    // 1. Generate embedding for user query
    console.log("🔍 Generating embedding for user query...");
    let queryEmbedding: number[];

    try {
      queryEmbedding = await getEmbedding(userMessage);
    } catch (error) {
      console.error("❌ Failed to generate embedding:", error);
      return NextResponse.json(
        { error: "Failed to process query" },
        { status: 500 }
      );
    }

    // 2. Query Pinecone from both namespaces
    console.log("🔍 Querying Pinecone for relevant context...");

    const [restaurantResult, menuResult] = await Promise.all([
      index
        .namespace("restaurant")
        .query({
          topK: 3,
          vector: queryEmbedding,
          includeMetadata: true,
        })
        .catch((error) => {
          console.error("❌ Error querying restaurant namespace:", error);
          return { matches: [] };
        }),

      index
        .namespace("menu")
        .query({
          topK: 3,
          vector: queryEmbedding,
          includeMetadata: true,
        })
        .catch((error) => {
          console.error("❌ Error querying menu namespace:", error);
          return { matches: [] };
        }),
    ]);

    // 3. Extract and combine context
    const restaurantChunks =
      restaurantResult.matches
        ?.filter(
          (match) => match.metadata?.text && match.score && match.score > 0.3
        )
        .map((match) => {
          console.log(
            `📄 Restaurant match - Score: ${match.score?.toFixed(3)}, ID: ${
              match.id
            }`
          );
          return match.metadata?.text || "";
        })
        .join("\n\n") || "";

    const menuChunks =
      menuResult.matches
        ?.filter(
          (match) => match.metadata?.text && match.score && match.score > 0.3
        )
        .map((match) => {
          console.log(
            `🍽️ Menu match - Score: ${match.score?.toFixed(3)}, ID: ${match.id}`
          );
          return match.metadata?.text || "";
        })
        .join("\n\n") || "";

    console.log(
      "📄 Restaurant chunks found:",
      restaurantChunks.length > 0 ? "YES" : "NO"
    );
    console.log("🍽️ Menu chunks found:", menuChunks.length > 0 ? "YES" : "NO");

    // Log actual content for debugging
    console.log(
      "Restaurant chunks preview:",
      restaurantChunks.substring(0, 200)
    );
    console.log("Menu chunks preview:", menuChunks.substring(0, 200));

    // 4. Build context for LLM
    let contextualInfo = "";

    if (restaurantChunks.length > 0) {
      contextualInfo += `\nRESTAURANT INFORMATION:\n${restaurantChunks}\n`;
    }

    if (menuChunks.length > 0) {
      contextualInfo += `\nMENU ITEMS:\n${menuChunks}\n`;
    }

    if (!contextualInfo.trim()) {
      contextualInfo =
        "\nNo specific information found in our database for this query. Please ask about our restaurant's general information, menu items, prices, or hours.";
      console.log("⚠️ No relevant context found - using fallback message");
    }

    const systemMessage = {
      role: "system" as const,
      content: restaurantContext + contextualInfo,
    };

    // 5. Prepare messages for LLM
    const fullMessages = [systemMessage, ...messages];

    console.log("🤖 Calling LLM with context...");

    // 6. Call OpenAI/OpenRouter
    const completion = await openaiInstance.chat.completions.create({
      model: "meta-llama/llama-4-scout:free",
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0].message;
    console.log("✅ LLM response generated successfully");

    return NextResponse.json({
      message: response,
      debug: {
        restaurantChunksFound: restaurantChunks.length > 0,
        menuChunksFound: menuChunks.length > 0,
        embeddingModelLoaded: embeddingModelLoaded,
      },
    });
  } catch (error) {
    console.error("💥 Fatal error processing chat request:", error);
    return NextResponse.json(
      {
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
