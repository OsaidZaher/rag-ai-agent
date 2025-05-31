// VAPI related types
export interface VapiWebhookMessage {
  type:
    | "function-call"
    | "assistant-request"
    | "status-update"
    | "end-of-call-report"
    | "hang"
    | "transcript";
  call?: VapiCall;
  functionCall?: VapiFunctionCall;
  status?: string;
  transcript?: string;
  role?: "user" | "assistant";
  transcriptType?: "partial" | "final";
}

export interface VapiCall {
  id: string;
  status: string;
  duration?: number;
  phoneNumber?: string;
  assistant?: any;
}

export interface VapiFunctionCall {
  name: string;
  parameters: string;
}

export interface VapiAssistantConfig {
  name: string;
  model: {
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
    functions: VapiFunction[];
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  serverUrl: string;
}

export interface VapiFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export interface RestaurantInfoParams {
  query: string;
}

export interface MakeReservationParams {
  name?: string;
  email?: string;
  date?: string;
  time?: string;
  partySize?: number;
  specialRequests?: string;
}

export interface VapiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface VapiError {
  message: string;
  code?: string;
}
