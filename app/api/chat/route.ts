import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI client with OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": "Restaurant Assistant",
  },
});

// Restaurant context to provide to the AI
const restaurantContext = `
You are a helpful restaurant assistant. Your restaurant is called "Gourmet Delight".
You can provide information about:
- Menu items and prices
- Opening hours (Mon-Fri: 11am-10pm, Sat-Sun: 10am-11pm)
- Reservation process
- Special dietary accommodations (vegetarian, vegan, gluten-free options available)
- Specials of the day
- Location and directions

Be friendly, helpful, and concise in your responses.
`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Prepend system message with restaurant context
    const fullMessages = [
      { role: "system", content: restaurantContext },
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
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
