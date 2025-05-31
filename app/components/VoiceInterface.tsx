"use client";

import React from "react";
import { useVapi, CALL_STATUS } from "../../lib/hooks/useVapi";
import {
  Phone,
  PhoneCall,
  Mic,
  MicOff,
  Volume2,
  PhoneOff,
  MessageCircle,
  Loader2,
} from "lucide-react";

interface VoiceInterfaceProps {
  className?: string;
}

export default function VoiceInterface({
  className = "",
}: VoiceInterfaceProps) {
  const {
    callStatus,
    isSpeechActive,
    messages,
    audioLevel,
    startCall,
    endCall,
    toggleCall,
    toggleMute,
    isMuted,
  } = useVapi();

  const isCallActive = callStatus === CALL_STATUS.ACTIVE;
  const isCallLoading = callStatus === CALL_STATUS.LOADING;
  const isMicMuted = isMuted();

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">
          Voice Assistant
        </h2>
        <p className="text-gray-600">
          Talk to our AI assistant about menu items or make reservations
        </p>
      </div>

      {/* Call Status Indicator */}
      <div className="flex items-center justify-center mb-6">
        <div
          className={`w-4 h-4 rounded-full mr-2 ${
            isCallActive
              ? "bg-green-500 animate-pulse"
              : isCallLoading
              ? "bg-yellow-500 animate-pulse"
              : "bg-gray-300"
          }`}
        />
        <span className="text-sm font-medium text-gray-700">
          {isCallActive
            ? "Connected"
            : isCallLoading
            ? "Connecting..."
            : "Disconnected"}
        </span>
      </div>

      {/* Audio Level Indicator */}
      {isCallActive && (
        <div className="mb-6">
          <div className="flex items-center justify-center mb-2">
            <Volume2 className="h-4 w-4 text-gray-600 mr-2" />
            <span className="text-sm text-gray-600">Audio Level</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-100 ${
                isSpeechActive ? "bg-blue-500" : "bg-green-500"
              }`}
              style={{ width: `${audioLevel * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Call Button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={toggleCall}
          disabled={isCallLoading}
          className={`relative p-6 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 ${
            isCallActive
              ? "bg-red-500 hover:bg-red-600 focus:ring-red-200 text-white"
              : "bg-green-500 hover:bg-green-600 focus:ring-green-200 text-white"
          } ${isCallLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isCallLoading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : isCallActive ? (
            <PhoneOff className="h-8 w-8" />
          ) : (
            <Phone className="h-8 w-8" />
          )}

          {/* Pulsing ring for active calls */}
          {isCallActive && isSpeechActive && (
            <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping" />
          )}
        </button>
      </div>

      {/* Call Action Text */}
      <div className="text-center mb-6">
        <p className="text-lg font-medium text-gray-800">
          {isCallActive
            ? "Tap to end call"
            : isCallLoading
            ? "Connecting..."
            : "Tap to start voice call"}
        </p>
        {isCallActive && (
          <p className="text-sm text-gray-600 mt-1">
            {isSpeechActive
              ? "AI Assistant is speaking..."
              : "Listening for your voice..."}
          </p>
        )}
      </div>

      {/* Mute Button (only shown during active calls) */}
      {isCallActive && (
        <div className="flex justify-center mb-6">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-all duration-200 focus:outline-none focus:ring-4 ${
              isMicMuted
                ? "bg-red-100 text-red-600 focus:ring-red-200"
                : "bg-gray-100 text-gray-600 focus:ring-gray-200"
            }`}
          >
            {isMicMuted ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>
        </div>
      )}

      {/* Call Messages */}
      {messages.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center">
            <MessageCircle className="h-5 w-5 mr-2" />
            Conversation
          </h3>
          <div className="max-h-40 overflow-y-auto space-y-2">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-50 text-blue-900 ml-4"
                    : "bg-gray-50 text-gray-900 mr-4"
                }`}
              >
                <div className="text-xs text-gray-500 mb-1">
                  {message.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="text-sm">{message.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      {!isCallActive && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Click the phone button to start a voice call</li>
            <li>• Ask about our menu, hours, or restaurant information</li>
            <li>• Make reservations by providing your details</li>
            <li>
              • Speak naturally - our AI understands conversational language
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
