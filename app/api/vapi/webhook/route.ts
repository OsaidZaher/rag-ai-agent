import { NextRequest, NextResponse } from "next/server";

// Import the existing chat functionality to reuse RAG and booking capabilities
import { POST as chatHandler } from "../../chat/route";

export async function POST(req: NextRequest) {
  try {
    console.log("🎙️ VAPI webhook received");

    const body = await req.json();
    console.log("📦 Webhook body:", JSON.stringify(body, null, 2));
    const { message } = body;

    if (!message) {
      console.log("❌ No message in webhook body");
      return NextResponse.json(
        { error: "No message in webhook" },
        { status: 400 }
      );
    }

    console.log("📨 Message type:", message.type);
    console.log("📋 Message content keys:", Object.keys(message));

    // Handle different message types
    switch (message.type) {
      case "function-call":
        return await handleFunctionCall(message);

      case "conversation-update":
        return await handleConversationUpdate(message);

      case "status-update":
        return await handleStatusUpdate(message);

      case "end-of-call-report":
        return await handleEndOfCallReport(message);

      case "hang":
        return await handleHangNotification(message);

      default:
        console.log("⚠️ Unhandled message type:", message.type);
        return NextResponse.json({ status: "ok" });
    }
  } catch (error) {
    console.error("💥 VAPI webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleConversationUpdate(message: any) {
  console.log("💬 Handling conversation update");
  console.log("📝 Message details:", JSON.stringify(message, null, 2));

  // Check if this conversation update contains function call requests
  if (message.functionCall) {
    console.log("🔧 Function call detected in conversation update");
    return await handleFunctionCall(message);
  }

  // Check for function calls in different formats
  if (message.function_call) {
    console.log("🔧 Function call detected (function_call format)");
    return await handleFunctionCall({ functionCall: message.function_call });
  }

  // Check if this is a message with tool calls (alternative VAPI format)
  if (message.toolCalls && message.toolCalls.length > 0) {
    console.log("🛠️ Tool calls detected in conversation update");

    for (const toolCall of message.toolCalls) {
      if (toolCall.function?.name === "makeReservation") {
        const params = JSON.parse(toolCall.function.arguments);
        return await handleMakeReservation(params);
      } else if (toolCall.function?.name === "getRestaurantInfo") {
        const params = JSON.parse(toolCall.function.arguments);
        return await handleGetRestaurantInfo(params);
      }
    }
  }

  // Check if this is a transcript update that indicates reservation completion
  if (message.transcript) {
    console.log("📜 Transcript received:", message.transcript);

    // Look for reservation completion patterns in the transcript
    const transcript = message.transcript.toLowerCase();

    // Parse reservation details from the conversation if it looks complete
    if (
      transcript.includes("reservation") &&
      (transcript.includes("confirm") ||
        transcript.includes("book") ||
        transcript.includes("complete"))
    ) {
      console.log("📅 Potential reservation detected in transcript");

      // Try to extract reservation details from the conversation
      const reservationData = extractReservationFromTranscript(
        message.transcript
      );

      if (reservationData && reservationData.name && reservationData.email) {
        console.log("📋 Extracted reservation data:", reservationData);
        return await handleMakeReservation(reservationData);
      }
    }
  }

  // Check if message contains call data with potential function information
  if (message.call) {
    console.log("📞 Call data present:", message.call.id);

    // Check if call ended and contains summary with reservation info
    if (message.call.ended && message.call.summary) {
      console.log("📋 Call ended with summary:", message.call.summary);

      // Parse summary for reservation details
      const summaryData = extractReservationFromTranscript(
        message.call.summary
      );
      if (summaryData && summaryData.name && summaryData.email) {
        console.log("📋 Extracted from call summary:", summaryData);
        return await handleMakeReservation(summaryData);
      }
    }
  }

  // Check if this is an artifact or result message
  if (message.artifact && message.artifact.messages) {
    console.log("📋 Artifact with messages detected");

    for (const artifactMessage of message.artifact.messages) {
      if (artifactMessage.toolCalls) {
        for (const toolCall of artifactMessage.toolCalls) {
          if (toolCall.function?.name === "makeReservation") {
            const params = JSON.parse(toolCall.function.arguments);
            return await handleMakeReservation(params);
          } else if (toolCall.function?.name === "getRestaurantInfo") {
            const params = JSON.parse(toolCall.function.arguments);
            return await handleGetRestaurantInfo(params);
          }
        }
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}

function extractReservationFromTranscript(transcript: string): any {
  console.log("🔍 Extracting reservation details from transcript");

  // This is a simple extraction - you might want to use a more sophisticated approach
  const data: any = {};

  // Extract name (look for patterns like "my name is John" or "I'm Sarah")
  const nameMatch = transcript.match(
    /(?:my name is|i'm|i am)\s+([a-zA-Z\s]+)/i
  );
  if (nameMatch) {
    data.name = nameMatch[1].trim();
  }

  // Extract email (look for email patterns)
  const emailMatch = transcript.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  if (emailMatch) {
    data.email = emailMatch[1];
  }

  // Extract date (look for date patterns)
  const dateMatch = transcript.match(
    /(?:on|for)\s+((?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{1,2}th|\d{1,2}st|\d{1,2}nd)\s*\d*[,\s]*\d*)/i
  );
  if (dateMatch) {
    data.date = dateMatch[1].trim();
  }

  // Extract time (look for time patterns)
  const timeMatch = transcript.match(
    /(?:at|for)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock))/i
  );
  if (timeMatch) {
    data.time = timeMatch[1];
  }

  // Extract party size
  const partySizeMatch = transcript.match(
    /(?:for|party of|table for)\s*(\d+)(?:\s*people)?/i
  );
  if (partySizeMatch) {
    data.partySize = parseInt(partySizeMatch[1]);
  }

  console.log("📊 Extracted data:", data);
  return data;
}

async function handleFunctionCall(message: any) {
  console.log("🔧 Handling function call:", message.functionCall?.name);

  const { functionCall } = message;

  if (!functionCall) {
    return NextResponse.json(
      { error: "No function call data" },
      { status: 400 }
    );
  }

  const { name, parameters } = functionCall;
  let parsedParams;

  try {
    parsedParams = JSON.parse(parameters);
  } catch (error) {
    console.error("❌ Error parsing function parameters:", error);
    return NextResponse.json({
      result:
        "I'm sorry, there was an error processing your request. Please try again.",
    });
  }

  try {
    switch (name) {
      case "getRestaurantInfo":
        return await handleGetRestaurantInfo(parsedParams);

      case "makeReservation":
        return await handleMakeReservation(parsedParams);

      default:
        console.log("⚠️ Unknown function:", name);
        return NextResponse.json({
          result:
            "I'm sorry, I don't understand that request. Please try asking about our menu or making a reservation.",
        });
    }
  } catch (error) {
    console.error("💥 Function call error:", error);
    return NextResponse.json({
      result:
        "I'm sorry, there was an error processing your request. Please try again later.",
    });
  }
}

async function handleGetRestaurantInfo(params: { query: string }) {
  console.log("ℹ️ Getting restaurant info for query:", params.query);

  try {
    // Create a request to reuse the existing chat functionality (RAG system)
    const chatRequest = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: params.query,
          },
        ],
        bookingState: null, // This is an information query, not booking
      }),
    });

    // Call the existing chat handler to leverage RAG functionality
    const response = await chatHandler(chatRequest as NextRequest);
    const result = await response.json();

    if (result.message?.content) {
      return NextResponse.json({
        result: result.message.content,
      });
    } else {
      return NextResponse.json({
        result:
          "I'm sorry, I couldn't find information about that. Could you please be more specific about what you'd like to know?",
      });
    }
  } catch (error) {
    console.error("❌ Error getting restaurant info:", error);
    return NextResponse.json({
      result:
        "I'm sorry, I'm having trouble accessing our restaurant information right now. Please try again later.",
    });
  }
}

async function handleMakeReservation(params: {
  name?: string;
  email?: string;
  date?: string;
  time?: string;
  partySize?: number;
  specialRequests?: string;
}) {
  console.log(
    "📅 Making reservation with params:",
    JSON.stringify(params, null, 2)
  );

  // Check if we have all required information
  const { name, email, date, time, partySize, specialRequests } = params;

  if (!name || !email || !date || !time || !partySize) {
    console.log("❌ Missing required fields:", {
      name: !!name,
      email: !!email,
      date: !!date,
      time: !!time,
      partySize: !!partySize,
    });
    return NextResponse.json({
      result:
        "I need a few more details to complete your reservation. Please provide your full name, email address, preferred date and time, and the number of people in your party.",
    });
  }

  // Validate party size
  if (partySize > 8 || partySize < 1) {
    console.log("❌ Invalid party size:", partySize);
    return NextResponse.json({
      result:
        "I'm sorry, we can only accommodate parties of 1 to 8 people. Please let me know if you'd like to adjust your party size.",
    });
  }

  try {
    // Format the booking message for the existing chat system
    const bookingMessage = `I'd like to make a reservation for ${name} (${email}) on ${date} at ${time} for ${partySize} people. ${
      specialRequests ? `Special requests: ${specialRequests}` : ""
    }`;

    // Handle date formatting - add current year if missing
    let formattedDate = date;
    const currentYear = new Date().getFullYear();

    // Check if date already has a year
    if (!date.includes(currentYear.toString()) && !date.includes("202")) {
      // Add current year to dates like "03/18", "March 18", "3/18"
      if (date.includes("/")) {
        formattedDate = `${date}/${currentYear}`;
      } else {
        // For text dates like "March 18", let JavaScript try to parse it with current year
        formattedDate = `${date}, ${currentYear}`;
      }
    }

    console.log(`📅 Original date: "${date}", Formatted: "${formattedDate}"`);

    // Create dateTime string and validate it
    const dateTimeString = `${formattedDate} ${time}`;
    const dateTimeObj = new Date(dateTimeString);

    console.log(`📅 DateTime string: "${dateTimeString}"`);
    console.log(`📅 DateTime object: ${dateTimeObj.toISOString()}`);
    console.log(`📅 DateTime valid: ${!isNaN(dateTimeObj.getTime())}`);

    if (isNaN(dateTimeObj.getTime())) {
      console.log("❌ Invalid date/time format");
      return NextResponse.json({
        result:
          "I'm sorry, there was an issue with the date and time format. Please try again with a clear date and time.",
      });
    }

    const bookingData = {
      name,
      email,
      date: formattedDate,
      time: time,
      dateTime: dateTimeObj.toISOString(),
      partySize,
      specialRequests: specialRequests || "None",
    };

    console.log("📋 Final booking data:", JSON.stringify(bookingData, null, 2)); // Create a request to reuse the existing booking functionality
    // We set the message to "yes" to trigger the confirmation flow in the chat handler
    const chatRequest = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "yes", // This triggers the booking confirmation in the chat handler
          },
        ],
        bookingState: {
          step: "confirmation",
          data: bookingData,
        },
      }),
    });

    console.log("📞 Calling chat handler with booking data...");
    console.log(
      "📋 Request body being sent:",
      JSON.stringify(
        {
          messages: [
            {
              role: "user",
              content: "yes",
            },
          ],
          bookingState: {
            step: "confirmation",
            data: bookingData,
          },
        },
        null,
        2
      )
    );

    // Call the existing chat handler to leverage booking functionality
    const response = await chatHandler(chatRequest as NextRequest);
    const result = await response.json();

    console.log("📋 Chat handler response:", JSON.stringify(result, null, 2));

    if (result.message?.content) {
      console.log("✅ Reservation completed successfully");
      return NextResponse.json({
        result: result.message.content,
      });
    } else {
      console.log("⚠️ No message content in response");
      return NextResponse.json({
        result:
          "I've processed your reservation request. You should receive a confirmation shortly.",
      });
    }
  } catch (error) {
    console.error("💥 Error making reservation:", error);
    return NextResponse.json({
      result:
        "I'm sorry, there was an error processing your reservation. Please try calling us directly or try again later.",
    });
  }
}

async function handleStatusUpdate(message: any) {
  console.log("📊 Call status update:", message.status);

  // Log the status for monitoring
  if (message.status === "ended") {
    console.log("📞 Call ended for call ID:", message.call?.id);
  }

  return NextResponse.json({ status: "ok" });
}

async function handleEndOfCallReport(message: any) {
  console.log("📋 End of call report received");
  console.log("📞 Call ID:", message.call?.id);
  console.log("📝 Summary:", message.summary);
  console.log("⏱️ Duration:", message.call?.duration);

  // Here you could save call data to your database if needed
  // For now, just log it

  return NextResponse.json({ status: "ok" });
}

async function handleHangNotification(message: any) {
  console.log("⏰ Hang notification received for call:", message.call?.id);

  // You could implement recovery logic here if needed

  return NextResponse.json({ status: "ok" });
}
