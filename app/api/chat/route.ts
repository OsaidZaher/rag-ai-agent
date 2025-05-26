import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { pipeline } from "@xenova/transformers";
import { google } from "googleapis";

// Pinecone config
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const index = pc.index("firstres");

// Google Calendar and Sheets setup
const GOOGLE_CREDENTIALS = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}"
);
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: GOOGLE_CREDENTIALS,
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const calendar = google.calendar({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

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

// Function to check availability in Google Calendar
async function checkAvailability(
  dateTime: string,
  duration: number = 120
): Promise<boolean> {
  try {
    const startTime = new Date(dateTime);
    const endTime = new Date(startTime.getTime() + duration * 60000); // duration in minutes

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    // Check if there are any events in the time slot
    return !response.data.items || response.data.items.length === 0;
  } catch (error) {
    console.error("❌ Error checking availability:", error);
    return false;
  }
}

// Function to create booking in Google Calendar
async function createBooking(bookingData: any): Promise<string | null> {
  try {
    const startTime = new Date(bookingData.dateTime);
    const endTime = new Date(
      startTime.getTime() + (bookingData.duration || 120) * 60000
    );

    const event = {
      summary: `Restaurant Booking - ${bookingData.name}`,
      description: `
        Guest: ${bookingData.name}
        Email: ${bookingData.email}
        Party Size: ${bookingData.partySize}
        Special Requests: ${bookingData.specialRequests || "None"}
      `,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "America/New_York", // Adjust timezone as needed
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
    });

    return response.data.id || null;
  } catch (error) {
    console.error("❌ Error creating booking:", error);
    return null;
  }
}

// Function to save booking to Google Sheets
async function saveToGoogleSheets(
  bookingData: any,
  eventId: string
): Promise<boolean> {
  try {
    const values = [
      [
        new Date().toISOString(), // Timestamp
        bookingData.name,
        bookingData.email,
        bookingData.partySize,
        bookingData.dateTime,
        bookingData.specialRequests || "",
        eventId,
        "Confirmed",
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "RestaurantBookings!A:H", // Updated range to H (removed phone column)
      valueInputOption: "RAW",
      requestBody: {
        values,
      },
    });

    return true;
  } catch (error) {
    console.error("❌ Error saving to Google Sheets:", error);
    return false;
  }
}

// Enhanced function to detect intent (booking vs information vs cancel)
function detectIntent(message: string): "booking" | "information" | "cancel" {
  const bookingKeywords = [
    "book",
    "reserve",
    "reservation",
    "table",
    "appointment",
    "schedule",
    "make a booking",
    "book a table",
    "reserve a table",
    "start again",
  ];

  const cancelKeywords = [
    "cancel",
    "stop",
    "quit",
    "exit",
    "abort",
    "nevermind",
    "never mind",
    "forget it",
    "start over",
    "restart",
    "back",
    "go back",
    "never mind",
  ];

  const lowerMessage = message.toLowerCase();

  // Check for cancel intent first
  if (cancelKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return "cancel";
  }

  // Then check for booking intent
  if (bookingKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return "booking";
  }

  return "information";
}

// Function to extract booking information
function extractBookingInfo(message: string): any {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const dateRegex =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}(\/\d{4})?|\d{1,2}-\d{1,2}(-\d{4})?)\b/i;

  // Enhanced time regex to handle more flexible formats
  const timeRegex =
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\b|\b(\d{1,2})(?::(\d{2}))?\s*(?:o'clock|oclock)\b|\b(\d{1,2})\s*(am|pm|AM|PM)\b/;

  return {
    email: message.match(emailRegex)?.[0] || null,
    date: message.match(dateRegex)?.[0] || null,
    time: message.match(timeRegex)?.[0] || null,
  };
}

// Function to parse date in month/day format
function parseDate(dateInput: string): Date | null {
  try {
    const currentYear = new Date().getFullYear();

    // Handle MM/DD or MM/DD/YYYY format
    const dateMatch = dateInput.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1]) - 1; // Month is 0-indexed
      const day = parseInt(dateMatch[2]);
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : currentYear;
      return new Date(year, month, day);
    }

    // Handle month names (e.g., "December 25" or "Dec 25")
    const monthNameMatch = dateInput.match(
      /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s+(\d{4}))?/i
    );
    if (monthNameMatch) {
      const monthNames = {
        january: 0,
        jan: 0,
        february: 1,
        feb: 1,
        march: 2,
        mar: 2,
        april: 3,
        apr: 3,
        may: 4,
        june: 5,
        jun: 5,
        july: 6,
        jul: 6,
        august: 7,
        aug: 7,
        september: 8,
        sep: 8,
        october: 9,
        oct: 9,
        november: 10,
        nov: 10,
        december: 11,
        dec: 11,
      };
      const month =
        monthNames[monthNameMatch[1].toLowerCase() as keyof typeof monthNames];
      const day = parseInt(monthNameMatch[2]);
      const year = monthNameMatch[3]
        ? parseInt(monthNameMatch[3])
        : currentYear;
      return new Date(year, month, day);
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Enhanced function to parse time with more flexible formats
function parseTime(timeInput: string): string | null {
  const lowerInput = timeInput.toLowerCase().trim();

  // Handle various time formats
  let timeMatch;

  // Format: 8pm, 8 pm, 8PM, 8 PM
  timeMatch = lowerInput.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const period = timeMatch[2].toLowerCase();

    if ((period === "pm" || period === "p.m.") && hours !== 12) {
      hours += 12;
    } else if ((period === "am" || period === "a.m.") && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, "0")}:00`;
  }

  // Format: 8:30pm, 8:30 pm, 8:30PM, 8:30 PM
  timeMatch = lowerInput.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const period = timeMatch[3].toLowerCase();

    if ((period === "pm" || period === "p.m.") && hours !== 12) {
      hours += 12;
    } else if ((period === "am" || period === "a.m.") && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }

  // Format: 8 o'clock, 8 oclock
  timeMatch = lowerInput.match(/(\d{1,2})\s*(?:o'clock|oclock)/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    // Assume PM for dinner hours (5-11), AM for earlier hours
    const adjustedHours = hours >= 5 && hours <= 11 ? hours + 12 : hours;
    return `${adjustedHours.toString().padStart(2, "0")}:00`;
  }

  // Format: 20:30 (24-hour format)
  timeMatch = lowerInput.match(/(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];

    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, "0")}:${minutes}`;
    }
  }

  // Format: just numbers (8, 20, etc.)
  timeMatch = lowerInput.match(/^(\d{1,2})$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);

    // Smart interpretation based on restaurant hours
    if (hours >= 1 && hours <= 11) {
      // Assume PM for single digits during dinner hours
      const adjustedHours = hours + 12;
      return `${adjustedHours.toString().padStart(2, "0")}:00`;
    } else if (hours >= 12 && hours <= 23) {
      // 24-hour format
      return `${hours.toString().padStart(2, "0")}:00`;
    }
  }

  return null;
}

// Enhanced restaurant context with booking capabilities
const restaurantContext = `
You are an AI assistant for "Gourmet Delight" restaurant with THREE main capabilities:

1. INFORMATION ASSISTANT: Answer questions about the restaurant, menu, prices, hours, etc.
2. BOOKING AGENT: Help customers make reservations
3. CANCELLATION HANDLER: Help customers cancel or restart the booking process

IMPORTANT INSTRUCTIONS FOR INFORMATION QUERIES:
- ONLY use information from the provided restaurant data and menu items
- If asked about items not in the menu, clearly state they are not available
- Always mention prices when discussing menu items
- Be friendly and helpful

IMPORTANT INSTRUCTIONS FOR BOOKING QUERIES:
- When a customer wants to make a reservation, collect these details step by step:
  1. Full name
  2. Email address
  3. Date and time preferred (accept flexible time formats like "8pm", "8:30", "8 o'clock")
  4. Number of people in party
  5. Any special requests or dietary restrictions (keep to one line)

- ALWAYS confirm all details before proceeding with the booking
- Check availability before confirming
- Be conversational and helpful throughout the process
- Maximum party size is 8 people

IMPORTANT INSTRUCTIONS FOR CANCELLATION:
- If a customer wants to cancel, stop, or restart the booking process, immediately acknowledge their request
- Clear the booking state and offer to help with something else
- Be understanding and polite

If you detect a booking intent, guide the customer through the reservation process step by step.
If you detect an information intent, use the provided restaurant/menu data to respond.
If you detect a cancellation intent, stop the current process and offer alternatives.

Current conversation context will indicate if we're in a booking flow or information flow.
`;

const openaiInstance = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": "Restaurant AI Agent",
  },
});

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Processing chat request...");

    const { messages, bookingState } = await req.json();

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

    // Detect intent
    const intent = detectIntent(userMessage);
    console.log("🎯 Detected intent:", intent);

    let response;
    let newBookingState = bookingState || null;

    // Handle cancellation intent
    if (intent === "cancel" && bookingState) {
      console.log("❌ Cancellation detected during booking flow");
      return NextResponse.json({
        message: {
          role: "assistant",
          content:
            "No problem! I've cancelled the reservation process. Is there anything else I can help you with today? You can ask about our menu, restaurant information, or start a new reservation if you'd like.",
        },
        bookingState: null, // Clear the booking state
        debug: { intent: "cancel", previousState: bookingState?.step },
      });
    }

    if (intent === "booking" || bookingState) {
      // Handle booking flow
      response = await handleBookingFlow(userMessage, messages, bookingState);
      newBookingState = response.bookingState;
    } else {
      // Handle information flow (existing RAG functionality)
      response = await handleInformationFlow(userMessage, messages);
    }

    return NextResponse.json({
      message: response.message,
      bookingState: newBookingState,
      debug: response.debug,
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

async function handleBookingFlow(
  userMessage: string,
  messages: any[],
  bookingState: any
) {
  console.log("📅 Handling booking flow...");

  // Initialize booking state if not exists
  if (!bookingState) {
    bookingState = {
      step: "name",
      data: {},
    };
  }

  // Extract any information from the user message
  const extractedInfo = extractBookingInfo(userMessage);

  // Update booking data with extracted info
  if (extractedInfo.email) bookingState.data.email = extractedInfo.email;

  // Process based on current step
  let responseMessage = "";
  let isComplete = false;

  switch (bookingState.step) {
    case "name":
      if (!bookingState.data.name) {
        // Extract name from the message (simplified)
        const nameMatch = userMessage.match(
          /(?:my name is|i'm|i am)\s+([a-zA-Z\s]+)/i
        );
        if (nameMatch) {
          bookingState.data.name = nameMatch[1].trim();
        } else if (
          !userMessage.toLowerCase().includes("reservation") &&
          !userMessage.toLowerCase().includes("book")
        ) {
          // Assume the whole message is the name if it's not a booking request
          bookingState.data.name = userMessage.trim();
        }
      }

      if (bookingState.data.name) {
        responseMessage = `Great! Thank you, ${bookingState.data.name}. Now I'll need your email address to confirm your reservation.`;
        bookingState.step = "email";
      } else {
        responseMessage =
          "I'd be happy to help you make a reservation! To get started, could you please tell me your name?";
      }
      break;

    case "email":
      if (!bookingState.data.email) {
        const emailMatch = userMessage.match(
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
        );
        if (emailMatch) {
          bookingState.data.email = emailMatch[0];
        }
      }

      if (bookingState.data.email) {
        responseMessage = `Perfect! I have your email as ${bookingState.data.email}. Now, when would you like to dine with us? Please provide your preferred date and time.\n\nYou can format your time flexibly (like "8pm", "8:30pm", "8 o'clock") and date as month/day. We're open 11:30 AM - 10:00 PM Weekdays and 11:00 AM - 11:00 PM Weekends.`;
        bookingState.step = "datetime";
      } else {
        responseMessage =
          "I need a valid email address. Please provide your email in the format: example@email.com";
      }
      break;

    case "datetime":
      // Parse date and time from user input with enhanced flexibility
      if (!bookingState.data.dateTime) {
        const dateMatch = userMessage.match(
          /(\d{1,2}\/\d{1,2}(?:\/\d{4})?|(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:\s+\d{4})?)/i
        );

        // Enhanced time matching with multiple patterns
        const timeMatch = userMessage.match(
          /(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\b|\b(\d{1,2})(?::(\d{2}))?\s*(?:o'clock|oclock)\b|\b(\d{1,2})\s*(am|pm|AM|PM)\b|\b(\d{1,2})(?::(\d{2}))?\s*$/
        );

        if (dateMatch && timeMatch) {
          const parsedDate = parseDate(dateMatch[0]);
          const parsedTime = parseTime(timeMatch[0]);

          if (parsedDate && parsedTime) {
            const [hours, minutes] = parsedTime.split(":");
            parsedDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            bookingState.data.dateTime = parsedDate.toISOString();
          }
        }
      }

      if (bookingState.data.dateTime) {
        responseMessage = `Great! You'd like to book for ${new Date(
          bookingState.data.dateTime
        ).toLocaleString()}. How many people will be in your party? (Maximum 8 people)`;
        bookingState.step = "party_size";
      } else {
        responseMessage =
          "I need both date and time. Please provide:\n- Date: MM/DD format (like 12/25)\n- Time: You can say it naturally like '8pm', '8:30pm', '8 o'clock', or '20:30'\n\nFor example: '12/25 at 8pm' or 'December 25th at 8:30'";
      }
      break;

    case "party_size":
      if (!bookingState.data.partySize) {
        const sizeMatch = userMessage.match(/\b(\d+)\b/);
        if (sizeMatch) {
          const size = parseInt(sizeMatch[1]);
          if (size >= 1 && size <= 8) {
            bookingState.data.partySize = size;
          }
        }
      }

      if (bookingState.data.partySize) {
        responseMessage = `Perfect! Party of ${bookingState.data.partySize}. Do you have any special requests or dietary restrictions? Please keep it to one line, or say 'none' if you don't have any.`;
        bookingState.step = "special_requests";
      } else {
        responseMessage =
          "Please specify the number of people (1-8). How many people will be joining you for dinner?";
      }
      break;

    case "special_requests":
      if (!bookingState.data.specialRequests) {
        bookingState.data.specialRequests =
          userMessage.toLowerCase() === "none" ? "" : userMessage;
      }

      // Show confirmation
      responseMessage = `Let me confirm your reservation details:
      
Name: ${bookingState.data.name}
Email: ${bookingState.data.email}
Date & Time: ${new Date(bookingState.data.dateTime).toLocaleString()}
Party Size: ${bookingState.data.partySize}
Special Requests: ${bookingState.data.specialRequests || "None"}

Is this information correct? Please reply 'yes' to confirm or tell me what needs to be changed.`;
      bookingState.step = "confirmation";
      break;

    case "confirmation":
      if (
        userMessage.toLowerCase().includes("yes") ||
        userMessage.toLowerCase().includes("confirm")
      ) {
        // Check availability
        const isAvailable = await checkAvailability(bookingState.data.dateTime);

        if (!isAvailable) {
          responseMessage =
            "I'm sorry, but that time slot is not available. Could you please choose a different date and time? You can use flexible formats like '8pm', '8:30pm', or '8 o'clock'.";
          bookingState.step = "datetime";
          bookingState.data.dateTime = null;
        } else {
          // Create the booking
          const eventId = await createBooking(bookingState.data);

          if (eventId) {
            const sheetsSaved = await saveToGoogleSheets(
              bookingState.data,
              eventId
            );

            if (sheetsSaved) {
              responseMessage = `🎉 Excellent! Your reservation has been confirmed!

Confirmation Details:
- Name: ${bookingState.data.name}
- Date & Time: ${new Date(bookingState.data.dateTime).toLocaleString()}
- Party Size: ${bookingState.data.partySize}
- Confirmation ID: ${eventId.substring(0, 8)}

You'll receive a confirmation email shortly. We look forward to welcoming you to Gourmet Delight!

Is there anything else I can help you with today?`;
              isComplete = true;
            } else {
              responseMessage =
                "Your reservation has been created in our calendar, but there was an issue saving to our records. Please call us to confirm. I apologize for the inconvenience.";
              isComplete = true;
            }
          } else {
            responseMessage =
              "I'm sorry, there was an issue creating your reservation. Please try again or call us directly.";
            bookingState.step = "confirmation";
          }
        }
      } else {
        responseMessage =
          "What would you like to change? Please let me know and I'll update your information. You can also say 'cancel' to start over.";
        // You could add logic here to detect what they want to change and go to that step
      }
      break;
  }

  return {
    message: { role: "assistant", content: responseMessage },
    bookingState: isComplete ? null : bookingState,
    debug: { intent: "booking", step: bookingState?.step },
  };
}

async function handleInformationFlow(userMessage: string, messages: any[]) {
  console.log("ℹ️ Handling information flow...");

  // Generate embedding for user query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(userMessage);
  } catch (error) {
    console.error("❌ Failed to generate embedding:", error);
    return {
      message: {
        role: "assistant",
        content:
          "I'm having trouble processing your request. Please try again.",
      },
      debug: { error: "embedding_failed" },
    };
  }

  // Query Pinecone from both namespaces
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

  // Extract and combine context
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

  // Build context for LLM
  let contextualInfo = "";

  if (restaurantChunks.length > 0) {
    contextualInfo += `\nRESTAURANT INFORMATION:\n${restaurantChunks}\n`;
  }

  if (menuChunks.length > 0) {
    contextualInfo += `\nMENU ITEMS:\n${menuChunks}\n`;
  }

  if (!contextualInfo.trim()) {
    contextualInfo =
      "\nNo specific information found in our database for this query. Please ask about our restaurant's general information, menu items, prices, or hours. You can also make a reservation by saying 'I'd like to make a reservation'.";
    console.log("⚠️ No relevant context found - using fallback message");
  }

  const systemMessage = {
    role: "system" as const,
    content: restaurantContext + contextualInfo,
  };

  // Prepare messages for LLM
  const fullMessages = [systemMessage, ...messages];

  console.log("🤖 Calling LLM with context...");

  // Call OpenAI/OpenRouter
  const completion = await openaiInstance.chat.completions.create({
    model: "meta-llama/llama-4-scout:free",
    messages: fullMessages,
    temperature: 0.7,
    max_tokens: 500,
  });

  const response = completion.choices[0].message;
  console.log("✅ LLM response generated successfully");

  return {
    message: response,
    debug: {
      intent: "information",
      restaurantChunksFound: restaurantChunks.length > 0,
      menuChunksFound: menuChunks.length > 0,
      embeddingModelLoaded: embeddingModelLoaded,
    },
  };
}
