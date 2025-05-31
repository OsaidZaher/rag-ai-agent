import ChatInterface from "./components/ChatInterface";
import VoiceInterface from "./components/VoiceInterface";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-8 text-center">
        Gourmet Delight Restaurant
      </h1>

      {/* Main Interface Container */}
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Text Chat Interface */}
          <div className="order-2 lg:order-1">
            <ChatInterface />
          </div>

          {/* Voice Interface */}
          <div className="order-1 lg:order-2">
            <VoiceInterface />
          </div>
        </div>
      </div>

      <footer className="mt-8 text-center text-black text-sm">
        <p>Powered by OpenRouter API + VAPI Voice AI</p>
      </footer>
    </div>
  );
}
