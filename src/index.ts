import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error("Failed to start dmx-mcp server:", err);
  process.exit(1);
});
