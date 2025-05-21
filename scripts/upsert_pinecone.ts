import { Pinecone } from "@pinecone-database/pinecone";
import { pipeline } from "@xenova/transformers";
import fs from "fs";
import path from "path";

// Pinecone config
const pc = new Pinecone({
  apiKey:
    "pcsk_2PwK5j_TH78PLPNs1a2dMCZnsid3QX1dwXrzim2VoYJ9Trq8dxKcGhFmbFcbTx2AevVQtu",
});
const index = pc.index("firstres");

// Embedding function
let embed: any = null;

async function getEmbedding(text: string): Promise<number[]> {
  try {
    if (!embed) {
      console.log("Loading embedding model...");
      embed = await pipeline(
        "feature-extraction",
        "Xenova/multilingual-e5-large"
      );
      console.log("✅ Embedding model loaded successfully");
    }

    // Use "passage:" prefix for consistency with query script
    const output = await embed("passage: " + text, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data as number[]);
    return embedding;
  } catch (error) {
    console.error("❌ Error generating embedding:", error);
    throw new Error("Failed to generate embedding");
  }
}

// Function to create text content from menu item
function createMenuText(item: any): string {
  const dietaryInfo =
    item.metadata?.dietary_options?.length > 0
      ? ` (${item.metadata.dietary_options.join(", ")})`
      : "";

  return `${item.title} - ${item.description} Price: $${
    item.price
  }${dietaryInfo}. Category: ${item.category}. Cuisine: ${
    item.metadata?.cuisine_style || "Unknown"
  }.`;
}

// Function to create text content from restaurant info
function createRestaurantText(item: any): string {
  if (typeof item.content === "string") {
    return `${item.section}: ${item.content}`;
  } else if (typeof item.content === "object") {
    // Handle structured content like contact info or hours
    const contentStr = Object.entries(item.content)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    return `${item.section}: ${contentStr}`;
  }
  return `${item.section}: ${JSON.stringify(item.content)}`;
}

async function upsertMenuItems() {
  console.log("📖 Starting menu items upsert...");

  // Read the menu JSON file from data folder
  const menuPath = path.join(process.cwd(), "data", "menu_items.json");
  const menuData = JSON.parse(fs.readFileSync(menuPath, "utf8"));

  const vectors = [];

  for (const item of menuData) {
    console.log(`Processing menu item: ${item.title}`);

    const textContent = createMenuText(item);
    const embedding = await getEmbedding(textContent);

    vectors.push({
      id: item.id,
      values: embedding,
      metadata: {
        text: textContent,
        title: item.title,
        description: item.description,
        price: item.price,
        category: item.category,
        meal_type: item.metadata?.meal_type,
        cuisine_style: item.metadata?.cuisine_style,
        dietary_options: item.metadata?.dietary_options || [],
      },
    });
  }

  // Upsert to menu namespace
  await index.namespace("menu").upsert(vectors);
  console.log(
    `✅ Successfully upserted ${vectors.length} menu items to Pinecone`
  );
}

async function upsertRestaurantInfo() {
  console.log("🏪 Starting restaurant info upsert...");

  // Read the restaurant info JSON file from data folder
  const restaurantPath = path.join(
    process.cwd(),
    "data",
    "restaurant_info.json"
  );
  const restaurantData = JSON.parse(fs.readFileSync(restaurantPath, "utf8"));

  const vectors = [];

  for (const item of restaurantData) {
    console.log(`Processing restaurant info: ${item.section}`);

    const textContent = createRestaurantText(item);
    const embedding = await getEmbedding(textContent);

    vectors.push({
      id: item.id,
      values: embedding,
      metadata: {
        text: textContent,
        section: item.section,
        info_type: item.metadata?.info_type,
        ...item.metadata, // Include all other metadata
      },
    });
  }

  // Upsert to restaurant namespace
  await index.namespace("restaurant").upsert(vectors);
  console.log(
    `✅ Successfully upserted ${vectors.length} restaurant info items to Pinecone`
  );
}

async function main() {
  try {
    console.log("🚀 Starting data upsert process...");

    // Check if JSON files exist in data folder
    const menuPath = path.join(process.cwd(), "data", "menu_items.json");
    const restaurantPath = path.join(
      process.cwd(),
      "data",
      "restaurant_info.json"
    );

    if (!fs.existsSync(menuPath)) {
      console.error("❌ menu_items.json not found in data/ directory");
      process.exit(1);
    }

    if (!fs.existsSync(restaurantPath)) {
      console.error("❌ restaurant_info.json not found in data/ directory");
      process.exit(1);
    }

    // Upsert menu items
    await upsertMenuItems();

    // Small delay between operations
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Upsert restaurant info
    await upsertRestaurantInfo();

    console.log("🎉 All data successfully upserted to Pinecone!");
  } catch (error) {
    console.error("💥 Error during upsert process:", error);
    process.exit(1);
  }
}

// Run the script
main();
