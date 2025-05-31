// Test script to verify VAPI booking functionality
import fetch from "node-fetch";

async function testBooking() {
  const testReservation = {
    message: {
      type: "function-call",
      functionCall: {
        name: "makeReservation",        parameters: JSON.stringify({
          name: "John Doe",
          email: "john.doe@example.com",
          date: "07/15",
          time: "6:00 PM",
          partySize: 2,
          specialRequests: "Quiet table please",
        }),
      },
    },
  };

  try {
    console.log("🧪 Testing VAPI booking webhook...");
    console.log(
      "📋 Sending test data:",
      JSON.stringify(testReservation, null, 2)
    );

    const response = await fetch("http://localhost:3000/api/vapi/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testReservation),
    });

    const result = await response.json();
    console.log("📊 Response status:", response.status);
    console.log("📋 Response body:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testBooking();
