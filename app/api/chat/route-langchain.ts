import { NextRequest, NextResponse } from "next/server";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "langchain/document";

// Import restaurant data
import restaurantData from "../../data/restaurant_docs_detailed.json";

// Set up OpenAI configuration for OpenRouter
const openAIConfig = {
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": "Restaurant Assistant",
  },
};

// Configure embeddings with OpenRouter
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  modelName: "text-embedding-ada-002", // OpenRouter supports this model
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: openAIConfig.defaultHeaders,
  },
});

// Initialize in-memory vector store (in production, would persist to disk)
let vectorStore;

// Initialize the vector store with restaurant data
async function initializeVectorStore() {
  try {
    console.log("Initializing vector store...");

    // Convert restaurant data to LangChain document format
    const documents = restaurantData.map(
      (item: { id: string; text: string }) =>
        new Document({
          pageContent: item.text,
          metadata: { id: item.id },
        })
    );

    // Create and populate the vector store
    vectorStore = await Chroma.fromDocuments(documents, embeddings, {
      collectionName: "restaurant_data",
      url: process.env.CHROMA_URL, // Optional: for persistent storage
    });

    console.log("Vector store initialized successfully");
    return vectorStore;
  } catch (error) {
    console.error("Error initializing vector store:", error);
    throw error;
  }
}

// Initialize vector store on server start
const vectorStorePromise = initializeVectorStore();

// Prepare the restaurant context
function buildRestaurantContext(relevantDocs: Document[]) {
  const docsText = relevantDocs.map((doc) => doc.pageContent).join("\n\n");

  return `
You are a helpful restaurant assistant for "Ristorante Bella Vista". 
You're friendly, helpful, and concise in your responses.

RESTAURANT INFORMATION:
${docsText}

Use ONLY the information above to answer the customer's question. If the information doesn't contain an answer to their question, politely say you don't have that specific information and offer to help with something else.

Remember these guidelines:
1. Give concise but complete answers
2. Use the conversation history to maintain context
3. Be friendly and courteous as you represent the restaurant
4. For dishes, always mention the name AND price
5. For hours, provide the full schedule for relevant days
`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Make sure vector store is initialized
    const store = await vectorStorePromise;

    // Extract the latest user query
    const latestUserMessage =
      messages.filter((msg: { role: string }) => msg.role === "user").pop()
        ?.content || "";

    // Search for relevant documents
    const relevantDocs = await store.similaritySearch(latestUserMessage, 3);

    // Build context for the model
    const restaurantContext = buildRestaurantContext(relevantDocs);

    // Prepare messages for the LLM
    const fullMessages = [
      { role: "system", content: restaurantContext },
      ...messages,
    ];

    // Convert to format expected by OpenAI
    const openAIMessages = fullMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Set up API call parameters
    const params = {
      model: "meta-llama/llama-4-scout",
      messages: openAIMessages,
      temperature: 0.7,
      stream: false,
    };

    // Call OpenRouter API
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
          "X-Title": "Restaurant Assistant",
        },
        body: JSON.stringify(params),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    return NextResponse.json({
      message: data.choices[0].message,
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
