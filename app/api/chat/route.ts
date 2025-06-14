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
    // Use the separate date and time fields if available, otherwise parse from dateTime
    let date, time;

    if (bookingData.date && bookingData.time) {
      // Use the separate fields directly
      date = bookingData.date;
      time = bookingData.time;
    } else if (bookingData.dateTime) {
      // Parse from combined dateTime as fallback
      const bookingDateTime = new Date(bookingData.dateTime);
      date = bookingDateTime.toLocaleDateString();
      time = bookingDateTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      // Default values if neither is available
      date = "Not specified";
      time = "Not specified";
    }

    const values = [
      [
        new Date().toISOString(), // Timestamp
        bookingData.name,
        bookingData.email,
        bookingData.partySize,
        date, // Use separate date field
        time, // Use separate time field
        bookingData.specialRequests || "",
        eventId,
        "Confirmed",
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "RestaurantBookings!A:I",
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
    "mistake", // Added "mistake" as a cancel keyword
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

// Function to parse date in month/day or day/month format
function parseDate(dateInput: string): Date | null {
  try {
    const currentYear = new Date().getFullYear();

    // Handle MM/DD or DD/MM or MM/DD/YYYY format
    const dateMatch = dateInput.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    if (dateMatch) {
      const firstNum = parseInt(dateMatch[1]);
      const secondNum = parseInt(dateMatch[2]);
      let month, day;

      // Determine if it's MM/DD or DD/MM format
      // If first number is > 12, it must be a day
      if (firstNum > 12) {
        day = firstNum;
        month = secondNum - 1; // Month is 0-indexed
      }
      // If second number is > 12, it must be a day
      else if (secondNum > 12) {
        month = firstNum - 1; // Month is 0-indexed
        day = secondNum;
      }
      // If both could be month or day, assume MM/DD format as default
      else {
        month = firstNum - 1; // Month is 0-indexed
        day = secondNum;
      }

      const year = dateMatch[3] ? parseInt(dateMatch[3]) : currentYear;
      return new Date(year, month, day);
    }

    // Handle month names (e.g., "December 25" or "Dec 25" or "25 December" or "25 Dec")
    const monthNameMatch = dateInput.match(
      /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s+(\d{4}))?|(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?/i
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

      let month, day, year;

      // Check if it's "Month Day" format
      if (monthNameMatch[1]) {
        month =
          monthNames[
            monthNameMatch[1].toLowerCase() as keyof typeof monthNames
          ];
        day = parseInt(monthNameMatch[2]);
        year = monthNameMatch[3] ? parseInt(monthNameMatch[3]) : currentYear;
      }
      // Otherwise it's "Day Month" format
      else {
        day = parseInt(monthNameMatch[4]);
        month =
          monthNames[
            monthNameMatch[5].toLowerCase() as keyof typeof monthNames
          ];
        year = monthNameMatch[6] ? parseInt(monthNameMatch[6]) : currentYear;
      }

      return new Date(year, month, day);
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Function to check if time is within restaurant opening hours
function isWithinOpeningHours(
  hours: number,
  minutes: number,
  dayOfWeek: number
): boolean {
  // Restaurant hours: 11:30 AM - 10:00 PM Weekdays and 11:00 AM - 11:00 PM Weekends
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 is Sunday, 6 is Saturday

  if (isWeekend) {
    // Weekend hours: 11:00 AM - 11:00 PM
    const openingHour = 11;
    const openingMinute = 0;
    const closingHour = 23;
    const closingMinute = 0;

    // Check if time is within opening hours
    if (
      hours < openingHour ||
      (hours === openingHour && minutes < openingMinute)
    ) {
      return false; // Too early
    }
    if (
      hours > closingHour ||
      (hours === closingHour && minutes > closingMinute)
    ) {
      return false; // Too late
    }
    return true;
  } else {
    // Weekday hours: 11:30 AM - 10:00 PM
    const openingHour = 11;
    const openingMinute = 30;
    const closingHour = 22;
    const closingMinute = 0;

    // Check if time is within opening hours
    if (
      hours < openingHour ||
      (hours === openingHour && minutes < openingMinute)
    ) {
      return false; // Too early
    }
    if (
      hours > closingHour ||
      (hours === closingHour && minutes > closingMinute)
    ) {
      return false; // Too late
    }
    return true;
  }
}

// Enhanced function to parse time with more flexible formats
function parseTime(timeInput: string, date?: Date): string | null {
  const lowerInput = timeInput.toLowerCase().trim();
  // Ensure currentDate is a proper Date object
  const currentDate = date instanceof Date ? date : new Date();
  const dayOfWeek = currentDate.getDay();

  // Handle various time formats
  let timeMatch;
  let hours = 0;
  let minutes = 0;

  // Format: 8pm, 8 pm, 8PM, 8 PM
  timeMatch = lowerInput.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    const period = timeMatch[2].toLowerCase();

    if ((period === "pm" || period === "p.m.") && hours !== 12) {
      hours += 12;
    } else if ((period === "am" || period === "a.m.") && hours === 12) {
      hours = 0;
    }

    minutes = 0;
    if (!isWithinOpeningHours(hours, minutes, dayOfWeek)) {
      return null; // Outside opening hours
    }

    return `${hours.toString().padStart(2, "0")}:00`;
  }

  // Format: 8:30pm, 8:30 pm, 8:30PM, 8:30 PM
  timeMatch = lowerInput.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3].toLowerCase();

    if ((period === "pm" || period === "p.m.") && hours !== 12) {
      hours += 12;
    } else if ((period === "am" || period === "a.m.") && hours === 12) {
      hours = 0;
    }

    if (!isWithinOpeningHours(hours, minutes, dayOfWeek)) {
      return null; // Outside opening hours
    }

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  // Format: 8 o'clock, 8 oclock
  timeMatch = lowerInput.match(/(\d{1,2})\s*(?:o'clock|oclock)/);
  if (timeMatch) {
    const rawHours = parseInt(timeMatch[1]);
    // Assume PM for dinner hours (5-11), AM for earlier hours
    hours = rawHours >= 5 && rawHours <= 11 ? rawHours + 12 : rawHours;
    minutes = 0;

    if (!isWithinOpeningHours(hours, minutes, dayOfWeek)) {
      return null; // Outside opening hours
    }

    return `${hours.toString().padStart(2, "0")}:00`;
  }

  // Format: 20:30 (24-hour format)
  timeMatch = lowerInput.match(/(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);

    if (hours >= 0 && hours <= 23) {
      if (!isWithinOpeningHours(hours, minutes, dayOfWeek)) {
        return null; // Outside opening hours
      }

      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }
  }

  // Format: just numbers (8, 20, etc.)
  timeMatch = lowerInput.match(/^(\d{1,2})$/);
  if (timeMatch) {
    const rawHours = parseInt(timeMatch[1]);

    // Smart interpretation based on restaurant hours
    if (rawHours >= 1 && rawHours <= 11) {
      // Assume PM for single digits during dinner hours
      hours = rawHours + 12;
      minutes = 0;
    } else if (rawHours >= 12 && rawHours <= 23) {
      // 24-hour format
      hours = rawHours;
      minutes = 0;
    } else {
      return null;
    }

    if (!isWithinOpeningHours(hours, minutes, dayOfWeek)) {
      return null; // Outside opening hours
    }

    return `${hours.toString().padStart(2, "0")}:00`;
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
        responseMessage = `Perfect! I have your email as ${bookingState.data.email}. Now, what date would you like to dine with us? Please provide your preferred date.\n\nYou can format your date as month/day (like 12/25) or use month names (like December 25).`;
        bookingState.step = "date";
      } else {
        responseMessage =
          "I need a valid email address. Please provide your email in the format: example@email.com";
      }
      break;

    case "date":
      // Parse date from user input
      if (!bookingState.data.date) {
        const dateMatch = userMessage.match(
          /(\d{1,2}\/\d{1,2}(?:\/\d{4})?|(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:\s+\d{4})?)/i
        );

        if (dateMatch) {
          const parsedDate = parseDate(dateMatch[0]);
          if (parsedDate) {
            // Store the date in a readable format
            bookingState.data.date = parsedDate.toLocaleDateString();
            // Also store the Date object for later combining with time
            bookingState.data._parsedDate = parsedDate;
          }
        }
      }

      if (bookingState.data.date) {
        responseMessage = `Great! You've selected ${bookingState.data.date} for your reservation. What time would you prefer? We're open 11:30 AM - 10:00 PM Weekdays and 11:00 AM - 11:00 PM Weekends.\n\nYou can format your time flexibly (like "8pm", "8:30pm", "8 o'clock").`;
        bookingState.step = "time";
      } else {
        responseMessage =
          "I need a valid date. Please provide:\n- Date: MM/DD format (like 12/25) or\n- Month and day: like 'December 25' or 'Dec 25'";
      }
      break;

    case "time":
      // Parse time from user input
      if (!bookingState.data.time) {
        // Enhanced time matching with multiple patterns
        const timeMatch = userMessage.match(
          /(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)\b|\b(\d{1,2})(?::(\d{2}))?\s*(?:o'clock|oclock)\b|\b(\d{1,2})\s*(am|pm|AM|PM)\b|\b(\d{1,2})(?::(\d{2}))?\s*$/
        );

        if (timeMatch) {
          // Pass the parsed date to parseTime to check against opening hours
          const parsedTime = parseTime(
            timeMatch[0],
            bookingState.data._parsedDate
          );
          if (parsedTime) {
            // Store the time string
            bookingState.data.time = parsedTime;

            // Combine date and time for the dateTime field
            if (bookingState.data._parsedDate) {
              const parsedDate = new Date(bookingState.data._parsedDate);
              const [hours, minutes] = parsedTime.split(":").map(Number);
              parsedDate.setHours(hours, minutes, 0, 0);

              // Check if date is in the past
              if (parsedDate < new Date()) {
                // If time is in the past today, assume tomorrow
                if (
                  parsedDate.getDate() === new Date().getDate() &&
                  parsedDate.getMonth() === new Date().getMonth() &&
                  parsedDate.getFullYear() === new Date().getFullYear()
                ) {
                  parsedDate.setDate(parsedDate.getDate() + 1);
                } else {
                  // If date is in the past, assume next year
                  parsedDate.setFullYear(parsedDate.getFullYear() + 1);
                }
              }

              bookingState.data.dateTime = parsedDate.toISOString();
            }
          }
        }
      }

      if (bookingState.data.time) {
        responseMessage = `Perfect! You've selected ${bookingState.data.date} at ${bookingState.data.time}. How many people will be in your party? (Maximum 8 people)`;
        bookingState.step = "party_size";
      } else {
        responseMessage =
          "I need a valid time within our opening hours. We're open 11:30 AM - 10:00 PM on weekdays and 11:00 AM - 11:00 PM on weekends. Please provide your preferred time like '7pm', '8:30pm', or '6 o'clock'.";
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
Date: ${bookingState.data.date}
Time: ${bookingState.data.time}
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
            "I'm sorry, but that time slot is not available. Could you please choose a different date and time? You can use flexible formats like '7pm', '8:30pm', or '6 o'clock'.";
          bookingState.step = "date";
          bookingState.data.date = null;
          bookingState.data.time = null;
          bookingState.data.dateTime = null;
          bookingState.data._parsedDate = null;
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
- Date: ${bookingState.data.date}
- Time: ${bookingState.data.time}
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
      } else if (userMessage.toLowerCase().includes("mistake")) {
        // Handle "mistake" to cancel the booking
        responseMessage =
          "I've cancelled this booking process. Is there anything else I can help you with today?";
        isComplete = true; // Reset the booking state
      } else {
        // Check for specific fields to change
        const lowerMessage = userMessage.toLowerCase();

        if (lowerMessage.includes("name")) {
          responseMessage = `Let's update your name. What is your correct name?`;
          bookingState.step = "name";
          bookingState.data.name = null; // Clear the name to be updated
        } else if (lowerMessage.includes("email")) {
          responseMessage = `Let's update your email. What is your correct email address?`;
          bookingState.step = "email";
          bookingState.data.email = null; // Clear the email to be updated
        } else if (lowerMessage.includes("date")) {
          responseMessage = `Let's update your date. What date would you prefer?`;
          bookingState.step = "date";
          bookingState.data.date = null; // Clear the date to be updated
          bookingState.data._parsedDate = null;
          bookingState.data.dateTime = null;
        } else if (lowerMessage.includes("time")) {
          responseMessage = `Let's update your time. What time would you prefer? We're open 11:30 AM - 10:00 PM on weekdays and 11:00 AM - 11:00 PM on weekends.`;
          bookingState.step = "time";
          bookingState.data.time = null; // Clear the time to be updated
          bookingState.data.dateTime = null;
        } else if (
          lowerMessage.includes("party") ||
          lowerMessage.includes("people") ||
          lowerMessage.includes("size")
        ) {
          responseMessage = `Let's update your party size. How many people will be in your party? (Maximum 8 people)`;
          bookingState.step = "party_size";
          bookingState.data.partySize = null; // Clear the party size to be updated
        } else if (
          lowerMessage.includes("special") ||
          lowerMessage.includes("request")
        ) {
          responseMessage = `Let's update your special requests. Please provide your special requests or dietary restrictions, or say 'none' if you don't have any.`;
          bookingState.step = "special_requests";
          bookingState.data.specialRequests = null; // Clear the special requests to be updated
        } else {
          responseMessage =
            "What would you like to change? Please specify which information you want to update (name, email, date, time, party size, or special requests). You can also say 'cancel' to start over or 'mistake' to cancel the booking.";
        }
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
