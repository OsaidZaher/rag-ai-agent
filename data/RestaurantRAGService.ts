import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "langchain/document";
import RestaurantDataManager from "./RestaurantDataManager";

class RestaurantRAGService {
  private static instance: RestaurantRAGService;
  private vectorStore: Chroma | null = null;
  private embeddings: OpenAIEmbeddings;
  private dataManager: RestaurantDataManager;
  private isInitializing = false;
  private initPromise: Promise<Chroma> | null = null;

  private constructor() {
    // Configure embeddings with OpenRouter
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      modelName: "text-embedding-ada-002", // OpenRouter supports this model
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
          "X-Title": "Restaurant Assistant",
        },
      },
    });

    this.dataManager = RestaurantDataManager.getInstance();
  }

  public static getInstance(): RestaurantRAGService {
    if (!RestaurantRAGService.instance) {
      RestaurantRAGService.instance = new RestaurantRAGService();
    }
    return RestaurantRAGService.instance;
  }

  /**
   * Initialize the vector store with restaurant data
   */
  public async initializeVectorStore(): Promise<Chroma> {
    // If already initialized, return the vector store
    if (this.vectorStore) {
      return this.vectorStore;
    }

    // If currently initializing, return the promise
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.isInitializing = true;

    // Create the initialization promise
    this.initPromise = new Promise<Chroma>(async (resolve, reject) => {
      try {
        console.log("Initializing vector store for restaurant data...");

        // Get documents from the data manager
        const documents = this.dataManager.getLangChainDocuments();

        // Create and populate the vector store
        const store = await Chroma.fromDocuments(documents, this.embeddings, {
          collectionName: "restaurant_data",
          url: process.env.CHROMA_URL, // Optional: for persistent storage
        });

        console.log("Vector store initialized successfully");

        // Store the vector store
        this.vectorStore = store;
        this.isInitializing = false;

        resolve(store);
      } catch (error) {
        console.error("Error initializing vector store:", error);
        this.isInitializing = false;
        this.initPromise = null;
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * Search for relevant documents based on a query
   */
  public async searchRelevantDocuments(
    query: string,
    k: number = 3
  ): Promise<Document[]> {
    try {
      // Make sure vector store is initialized
      const store = await this.initializeVectorStore();

      // Search for relevant documents
      const results = await store.similaritySearch(query, k);

      return results;
    } catch (error) {
      console.error("Error searching for relevant documents:", error);

      // Fallback: return some basic info if vector search fails
      return this.getFallbackDocuments();
    }
  }

  /**
   * Get fallback documents in case of search failure
   */
  private getFallbackDocuments(): Document[] {
    const restaurantInfo = this.dataManager.getRestaurantInfo();
    const topMenuItems = this.dataManager.getMenuItems().slice(0, 2);

    return [restaurantInfo, ...topMenuItems].filter(Boolean).map(
      (item) =>
        new Document({
          pageContent: item?.text || "",
          metadata: { id: item?.id || "unknown" },
        })
    );
  }

  /**
   * Build context for the LLM based on relevant documents
   */
  public buildRestaurantContext(relevantDocs: Document[]): string {
    const docsText = relevantDocs.map((doc) => doc.pageContent).join("\n\n");

    return `
You are a helpful restaurant assistant for "Ristorante Bella Vista". 
You're friendly, helpful, and concise in your responses.

RESTAURANT INFORMATION:
${docsText}

Use ONLY the information above to answer the customer's question. If the information doesn't contain an answer to their question, politely say you don't have that specific information and offer to help with something else.

Remember these guidelines:
1. Give concise but complete answers
2. Use the conversation history to maintain context
3. Be friendly and courteous as you represent the restaurant
4. For dishes, always mention the name AND price
5. For hours, provide the full schedule for relevant days
`;
  }
}

export default RestaurantRAGService;
