import { Pinecone } from "@pinecone-database/pinecone";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "@xenova/transformers";

// Pinecone config
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});
const index = pc.index("firstres");

// Load embedding model
async function getEmbedding(text: string): Promise<number[]> {
  const embed = await pipeline(
    "feature-extraction",
    "Xenova/multilingual-e5-large"
  );
  const output = await embed("passage: " + text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data);
}

async function upsertMarkdown(file: string, namespace: string) {
  const content = await fs.readFile(path.join(process.cwd(), file), "utf-8");
  // Split content into ~500 word chunks (approximate token count)
  const words = content.split(/\s+/);
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  const vectors = await Promise.all(
    chunks.map(async (chunk, i) => ({
      id: `${file}-${i}`,
      values: await getEmbedding(chunk),
      metadata: { file, chunk },
    }))
  );
  await index.namespace(namespace).upsert(vectors);
}

(async () => {
  await upsertMarkdown("restaurant_info.md", "restaurant");
  await upsertMarkdown("menu_items.md", "menu");
  console.log("Upserted!");
})();
