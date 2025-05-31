// VAPI SDK singleton instance
import Vapi from "@vapi-ai/web";

// Single VAPI instance initialization
export const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "");
