"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  X,
  ChefHat,
  Clock,
  Calendar,
  Menu,
  MessageCircle,
  User,
  RotateCcw,
  CalendarCheck,
  Phone,
  Mail,
  Users,
  CheckCircle,
  Info,
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type BookingState = {
  step: string;
  data: {
    name?: string;
    email?: string;
    phone?: string;
    dateTime?: string;
    date?: string;
    time?: string;
    partySize?: number;
    specialRequests?: string;
  };
} | null;

type QuickAction = {
  icon: React.ReactNode;
  label: string;
  query: string;
  type: "info" | "booking";
};

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [bookingState, setBookingState] = useState<BookingState>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions: QuickAction[] = [
    {
      icon: <ChefHat className="h-5 w-5" />,
      label: "Today's Specials",
      query: "What are today's specials?",
      type: "info",
    },
    {
      icon: <CalendarCheck className="h-5 w-5" />,
      label: "Make Reservation",
      query: "I'd like to make a reservation",
      type: "booking",
    },
    {
      icon: <Clock className="h-5 w-5" />,
      label: "Opening Hours",
      query: "What are your opening hours?",
      type: "info",
    },
    {
      icon: <Menu className="h-5 w-5" />,
      label: "Full Menu",
      query: "Can I see your full menu?",
      type: "info",
    },
  ];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isChatOpen) {
      inputRef.current?.focus();
    }
  }, [isChatOpen]);

  const handleSubmit = async (
    e: React.FormEvent | null,
    customQuery?: string
  ) => {
    if (e) e.preventDefault();

    const queryText = customQuery || input;
    if (!queryText.trim()) return;

    // Add user message to the chat
    const userMessage: Message = { role: "user", content: queryText };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Send request to the API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({
            role,
            content,
          })),
          bookingState: bookingState,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Update booking state if provided
      if (data.bookingState !== undefined) {
        setBookingState(data.bookingState);
      }

      // Add assistant response to chat
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message.content },
      ]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again later.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (query: string) => {
    handleSubmit(null, query);
  };

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setBookingState(null);
  };

  // Get booking summary card
  const getBookingSummary = () => {
    if (
      !bookingState ||
      !bookingState.data ||
      Object.keys(bookingState.data).length === 0
    )
      return null;

    const { data } = bookingState;

    return (
      <div className="mx-4 mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <h4 className="text-sm font-medium text-orange-800 mb-2 flex items-center gap-1">
          <CheckCircle className="h-4 w-4" />
          Booking Details
        </h4>
        <div className="space-y-1 text-sm text-orange-700">
          {data.name && (
            <div className="flex items-center gap-2">
              <User className="h-3 w-3" />
              <span>{data.name}</span>
            </div>
          )}
          {data.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3" />
              <span>{data.email}</span>
            </div>
          )}
          {data.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3" />
              <span>{data.phone}</span>
            </div>
          )}
          {data.date && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              <span>{data.date}</span>
            </div>
          )}
          {data.time && (
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span>{data.time}</span>
            </div>
          )}
          {data.partySize && (
            <div className="flex items-center gap-2">
              <Users className="h-3 w-3" />
              <span>Party of {data.partySize}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col">
      {isChatOpen ? (
        <div className="max-w-sm w-full shadow-xl rounded-lg overflow-hidden">
          {/* Chat Header */}
          <div className="bg-[#ff9980] text-white p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-white p-1 rounded-full">
                <ChefHat className="h-5 w-5 text-[#ff9980]" />
              </div>
              <div>
                <h3 className="font-bold">
                  {bookingState ? "Booking Assistant" : "Culinary Concierge"}
                </h3>
                <p className="text-xs">
                  {bookingState
                    ? "Reservation in progress..."
                    : "Online | Ready to assist"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearChat}
                className="text-white hover:bg-[#ff8066] p-1 rounded-full transition-colors"
                title="Clear chat"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                onClick={toggleChat}
                className="text-white hover:bg-[#ff8066] p-1 rounded-full transition-colors"
                title="Close chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Chat Body */}
          <div className="bg-[#faf6f2] flex-1 overflow-auto p-4 space-y-4 h-[400px]">
            {/* Booking Summary Card */}
            {getBookingSummary()}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="bg-[#ffebe6] p-6 rounded-full mb-4">
                  <Menu className="h-10 w-10 text-[#ff9980]" />
                </div>
                <h2 className="text-xl font-semibold text-[#5a3e36] mb-2">
                  Welcome to Gourmet Delight
                </h2>
                <p className="text-[#8a7a75] text-center mb-6">
                  I'm your AI dining assistant.
                  <br />I can help with menu questions or reservations!
                </p>

                <div className="grid grid-cols-2 gap-3 w-full">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickAction(action.query)}
                      className={`flex flex-col items-center p-3 rounded-lg border transition-colors ${
                        action.type === "booking"
                          ? "bg-orange-50 border-orange-200 hover:bg-orange-100"
                          : "bg-white border-[#ffe0d6] hover:bg-[#ffebe6]"
                      }`}
                    >
                      <div
                        className={`mb-2 ${
                          action.type === "booking"
                            ? "text-orange-500"
                            : "text-[#ff9980]"
                        }`}
                      >
                        {action.icon}
                      </div>
                      <span className="text-sm text-[#5a3e36]">
                        {action.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Info Notice */}
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* Profile Icon */}
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === "user"
                          ? "bg-[#4a4a4a]"
                          : bookingState
                          ? "bg-[#e67e22]"
                          : "bg-[#ff9980]"
                      }`}
                    >
                      {message.role === "user" ? (
                        <User className="h-4 w-4 text-white" />
                      ) : bookingState ? (
                        <CalendarCheck className="h-4 w-4 text-white" />
                      ) : (
                        <ChefHat className="h-4 w-4 text-white" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`p-3 rounded-lg max-w-[75%] whitespace-pre-line ${
                        message.role === "user"
                          ? "bg-[#e8f4fd] text-[#2c5aa0] border border-[#d1e7dd]"
                          : bookingState
                          ? "bg-orange-50 text-orange-900 border border-orange-200"
                          : "bg-white text-[#5a3e36] border border-[#e5e5e5] shadow-sm"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </>
            )}

            {isLoading && (
              <div className="flex justify-start items-start gap-3">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    bookingState ? "bg-[#e67e22]" : "bg-[#ff9980]"
                  }`}
                >
                  {bookingState ? (
                    <CalendarCheck className="h-4 w-4 text-white" />
                  ) : (
                    <ChefHat className="h-4 w-4 text-white" />
                  )}
                </div>
                <div
                  className={`rounded-lg p-3 border shadow-sm max-w-[75%] ${
                    bookingState
                      ? "bg-orange-50 border-orange-200"
                      : "bg-white border-[#e5e5e5]"
                  }`}
                >
                  <div className="flex space-x-2">
                    <div
                      className={`h-2 w-2 rounded-full animate-bounce ${
                        bookingState ? "bg-[#e67e22]" : "bg-[#ff9980]"
                      }`}
                    ></div>
                    <div
                      className={`h-2 w-2 rounded-full animate-bounce [animation-delay:0.2s] ${
                        bookingState ? "bg-[#e67e22]" : "bg-[#ff9980]"
                      }`}
                    ></div>
                    <div
                      className={`h-2 w-2 rounded-full animate-bounce [animation-delay:0.4s] ${
                        bookingState ? "bg-[#e67e22]" : "bg-[#ff9980]"
                      }`}
                    ></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* No Smart Input Suggestions - Removed as per requirements */}

          {/* Chat Input */}
          <form
            onSubmit={handleSubmit}
            className={`p-3 border-t ${
              bookingState
                ? "bg-orange-50 border-orange-200"
                : "bg-white border-[#ffe0d6]"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  bookingState
                    ? "Continue with your booking..."
                    : "Ask about menu or make a reservation..."
                }
                className={`flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 text-slate-500 ${
                  bookingState
                    ? "border-orange-200 focus:ring-orange-400"
                    : "border-[#ffe0d6] focus:ring-[#ff9980]"
                }`}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={`text-white p-2 rounded-full focus:outline-none focus:ring-2 disabled:cursor-not-allowed transition-colors ${
                  bookingState
                    ? "bg-[#e67e22] hover:bg-[#d35400] focus:ring-orange-400 disabled:bg-orange-300"
                    : "bg-[#ff9980] hover:bg-[#ff8066] focus:ring-[#ff9980] disabled:bg-[#ffccc2]"
                }`}
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        // Chat Open Button (visible when chat is closed)
        <button
          onClick={toggleChat}
          className={`text-white p-3 rounded-full shadow-lg focus:outline-none focus:ring-2 transition-colors ${
            bookingState
              ? "bg-[#e67e22] hover:bg-[#d35400] focus:ring-orange-400"
              : "bg-[#ff9980] hover:bg-[#ff8066] focus:ring-[#ff9980]"
          }`}
        >
          {bookingState ? (
            <CalendarCheck className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
        </button>
      )}
    </div>
  );
}
