import { GatewayClient } from "./client";

// npm run sdk:example -- sk-alfa-search-7f3c2a91 "Привет!"
const [
  apiKey = "sk-demo-00000000",
  prompt = "Напиши три коротких совета по code review",
] = process.argv.slice(2);

const client = new GatewayClient({ apiKey });
const startedAt = Date.now();

for await (const text of client.streamChat({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: prompt }],
})) {
  process.stdout.write(text);
}

console.log(`\n\n— ${Date.now() - startedAt} мс`);
