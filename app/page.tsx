import ChatInterface from "./components/ChatInterface";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-8 text-center">
        Gourmet Delight Restaurant
      </h1>
      <div className="w-full max-w-3xl">
        <ChatInterface />
      </div>
      <footer className="mt-8 text-center text-black text-sm">
        <p>Powered by OpenRouter API</p>
      </footer>
    </div>
  );
}
