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
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type QuickAction = {
  icon: React.ReactNode;
  label: string;
  query: string;
};

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions: QuickAction[] = [
    {
      icon: <ChefHat className="h-5 w-5" />,
      label: "Today's Specials",
      query: "What are today's specials?",
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      label: "Make a Reservation",
      query: "I'd like to make a reservation",
    },
    {
      icon: <Clock className="h-5 w-5" />,
      label: "Opening Hours",
      query: "What are your opening hours?",
    },
    {
      icon: <Menu className="h-5 w-5" />,
      label: "See Full Menu",
      query: "Can I see your full menu?",
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
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

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
                <h3 className="font-bold">Culinary Concierge</h3>
                <p className="text-xs">Online | Ready to assist</p>
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
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="bg-[#ffebe6] p-6 rounded-full mb-4">
                  <Menu className="h-10 w-10 text-[#ff9980]" />
                </div>
                <h2 className="text-xl font-semibold text-[#5a3e36] mb-2">
                  Welcome to our Restaurant
                </h2>
                <p className="text-[#8a7a75] text-center mb-6">
                  I'm your personal dining assistant.
                  <br />
                  How can I help you today?
                </p>

                <div className="grid grid-cols-2 gap-3 w-full">
                  {quickActions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => handleQuickAction(action.query)}
                      className="flex flex-col items-center p-3 bg-white rounded-lg border border-[#ffe0d6] hover:bg-[#ffebe6] transition-colors"
                    >
                      <div className="text-[#ff9980] mb-2">{action.icon}</div>
                      <span className="text-sm text-[#5a3e36]">
                        {action.label}
                      </span>
                    </button>
                  ))}
                </div>
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
                          : "bg-[#ff9980]"
                      }`}
                    >
                      {message.role === "user" ? (
                        <User className="h-4 w-4 text-white" />
                      ) : (
                        <ChefHat className="h-4 w-4 text-white" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`p-3 rounded-lg max-w-[75%] ${
                        message.role === "user"
                          ? "bg-[#e8f4fd] text-[#2c5aa0] border border-[#d1e7dd]"
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
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ff9980] flex items-center justify-center">
                  <ChefHat className="h-4 w-4 text-white" />
                </div>
                <div className="bg-white rounded-lg p-3 border border-[#e5e5e5] shadow-sm max-w-[75%]">
                  <div className="flex space-x-2">
                    <div className="h-2 w-2 bg-[#ff9980] rounded-full animate-bounce"></div>
                    <div className="h-2 w-2 bg-[#ff9980] rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="h-2 w-2 bg-[#ff9980] rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <form
            onSubmit={handleSubmit}
            className="bg-white p-3 border-t border-[#ffe0d6]"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question..."
                className="flex-1 px-4 py-2 border text-slate-500 border-[#ffe0d6] rounded-full focus:outline-none focus:ring-2 focus:ring-[#ff9980]"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-[#ff9980] text-white p-2 rounded-full hover:bg-[#ff8066] focus:outline-none focus:ring-2 focus:ring-[#ff9980] disabled:bg-[#ffccc2] disabled:cursor-not-allowed"
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
          className="bg-[#ff9980] text-white p-3 rounded-full shadow-lg hover:bg-[#ff8066] focus:outline-none focus:ring-2 focus:ring-[#ff9980] transition-colors"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
