export interface CustomerData {
  name: string;
  phone: string;
  email?: string;
  partySize?: number;
  preferences?: string[];
  bookingHistory?: Booking[];
}

export interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  dateTime: string;
  status: "confirmed" | "pending" | "cancelled";
  specialRequests?: string;
  createdAt: string;
}

export interface AgentResponse {
  type: "rag" | "booking" | "crm" | "routing";
  content: string;
  data?: any;
  requiresFollowUp?: boolean;
  nextAction?: string;
}

export interface ConversationContext {
  currentIntent: string;
  customerData?: Partial<CustomerData>;
  bookingData?: Partial<Booking>;
  previousMessages: Array<{ role: string; content: string }>;
  sessionId: string;
}
