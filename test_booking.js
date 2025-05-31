// Test script to verify VAPI booking functionality
const fetch = require("node-fetch");

async function testBooking() {
  const testReservation = {
    message: {
      type: "function-call",
      functionCall: {
        name: "makeReservation",
        parameters: JSON.stringify({
          name: "John Doe",
          email: "john.doe@example.com",
          date: "06/15",
          time: "7:30 PM",
          partySize: 4,
          specialRequests: "Window table please",
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
