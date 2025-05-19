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
async function getEmbedding(text: string): Promise<number[]> {
  if (!embed)
    embed = await pipeline(
      "feature-extraction",
      "Xenova/multilingual-e5-large"
    );
  const output = await embed("query: " + text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data);
}

// Restaurant context
const restaurantContext = `
You are a helpful restaurant assistant. Your restaurant is called "Gourmet Delight".
You can provide information about:
- Menu items and prices
  - Reservation process
- Special dietary accommodations (vegetarian, vegan, gluten-free options available)
- Specials of the day
- Location and directions

Be friendly, helpful, and concise in your responses.
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
    const { messages } = await req.json();
    const userMessage = messages[messages.length - 1]?.content || "";

    // 1. Embed user query
    const queryEmbedding = await getEmbedding(userMessage);

    // 2. Query Pinecone for relevant context
    const queryResult = await index.namespace("restaurant").query({
      topK: 3,
      vector: queryEmbedding,
      includeMetadata: true,
    });
    const contextChunks =
      queryResult.matches?.map((m) => m.metadata?.chunk).join("\n") || "";

    // 3. Prepend context to system prompt
    const ragContext = `Relevant restaurant info:\n${contextChunks}\n`;
    const fullMessages = [
      { role: "system", content: ragContext + restaurantContext },
      ...messages,
    ];

    // 4. Call OpenAI
    const completion = await openaiInstance.chat.completions.create({
      model: "meta-llama/llama-4-scout:free",
      messages: fullMessages,
    });

    return NextResponse.json({ message: completion.choices[0].message });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
