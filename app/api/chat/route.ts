import { NextRequest, NextResponse } from "next/server";
import RestaurantRAGService from "../../../data/RestaurantRAGService";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Get the RAG service instance
    const ragService = RestaurantRAGService.getInstance();

    // Extract the latest user query
    const latestUserMessage =
      messages.filter((msg: { role: string }) => msg.role === "user").pop()
        ?.content || "";

    // Search for relevant documents
    const relevantDocs = await ragService.searchRelevantDocuments(
      latestUserMessage,
      3
    );

    // Build context for the model
    const restaurantContext = ragService.buildRestaurantContext(relevantDocs);

    // Prepare messages for the LLM
    const fullMessages = [
      { role: "system", content: restaurantContext },
      ...messages,
    ];

    // Set up API call parameters
    const params = {
      model: "meta-llama/llama-4-scout",
      messages: fullMessages,
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
