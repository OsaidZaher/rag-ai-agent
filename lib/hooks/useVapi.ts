"use client";

import { useEffect, useState } from "react";
import { vapi } from "../vapi";
import { VapiMessage } from "../../types/vapi";

export enum CALL_STATUS {
  INACTIVE = "inactive",
  ACTIVE = "active",
  LOADING = "loading",
}

export function useVapi() {
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [callStatus, setCallStatus] = useState<CALL_STATUS>(
    CALL_STATUS.INACTIVE
  );
  const [messages, setMessages] = useState<VapiMessage[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  useEffect(() => {
    const onSpeechStart = () => {
      console.log("🎙️ Speech started");
      setIsSpeechActive(true);
    };

    const onSpeechEnd = () => {
      console.log("🎙️ Speech ended");
      setIsSpeechActive(false);
    };

    const onCallStart = () => {
      console.log("📞 Call started");
      setCallStatus(CALL_STATUS.ACTIVE);
    };

    const onCallEnd = () => {
      console.log("📞 Call ended");
      setCallStatus(CALL_STATUS.INACTIVE);
      setMessages([]);
    };

    const onVolumeLevel = (volume: number) => {
      setAudioLevel(volume);
    };

    const onMessage = (message: any) => {
      console.log("💬 VAPI message:", message);

      // Handle different message types
      if (message.type === "transcript") {
        if (message.transcriptType === "final") {
          const newMessage: VapiMessage = {
            role: message.role === "user" ? "user" : "assistant",
            content: message.transcript,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, newMessage]);
        }
      } else if (message.type === "function-call") {
        // Log function calls for debugging
        console.log("🔧 Function called:", message.functionCall?.name);
      }
    };

    const onError = (error: any) => {
      console.error("❌ VAPI error:", error);
      setCallStatus(CALL_STATUS.INACTIVE);
    };

    // Add event listeners
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("volume-level", onVolumeLevel);
    vapi.on("message", onMessage);
    vapi.on("error", onError);

    // Cleanup event listeners
    return () => {
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("volume-level", onVolumeLevel);
      vapi.off("message", onMessage);
      vapi.off("error", onError);
    };
  }, []);
  const startCall = async () => {
    try {
      setCallStatus(CALL_STATUS.LOADING);
      console.log("🚀 Starting VAPI call...");

      // Use the manually created assistant ID from environment variables
      const assistantId =
        process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ||
        "d7438642-3c00-4bcc-aa7d-e4e2f1f79fd8";

      await vapi.start(assistantId);

      console.log("✅ VAPI call started successfully");
    } catch (error) {
      console.error("❌ Error starting call:", error);
      setCallStatus(CALL_STATUS.INACTIVE);
    }
  };
  const endCall = () => {
    try {
      setCallStatus(CALL_STATUS.LOADING);
      console.log("🛑 Ending VAPI call...");

      vapi.stop();

      console.log("✅ VAPI call ended successfully");
    } catch (error) {
      console.error("❌ Error ending call:", error);
    }
  };

  const toggleCall = () => {
    if (callStatus === CALL_STATUS.ACTIVE) {
      endCall();
    } else if (callStatus === CALL_STATUS.INACTIVE) {
      startCall();
    }
  };
  const sendMessage = (content: string) => {
    try {
      // VAPI handles messages through the conversation flow
      // Direct message sending isn't typically needed as the assistant handles responses
      console.log("📤 Message would be sent:", content);
    } catch (error) {
      console.error("❌ Error sending message:", error);
    }
  };
  const toggleMute = () => {
    try {
      // VAPI SDK doesn't expose mute state directly
      // The muting is typically handled by the browser's media controls
      console.log("🔇 Mute toggle requested");
      return false;
    } catch (error) {
      console.error("❌ Error toggling mute:", error);
      return false;
    }
  };
  const sayMessage = (message: string, endAfter = false) => {
    try {
      // VAPI SDK doesn't have a direct say method
      // Messages are handled through the conversation flow
      console.log("💬 Would say message:", message, "End after:", endAfter);
    } catch (error) {
      console.error("❌ Error saying message:", error);
    }
  };
  return {
    callStatus,
    isSpeechActive,
    messages,
    audioLevel,
    startCall,
    endCall,
    toggleCall,
    sendMessage,
    toggleMute,
    sayMessage,
    isMuted: () => false, // Simplified since VAPI SDK doesn't expose mute state
  };
}
