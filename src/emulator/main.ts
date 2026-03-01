import { DMXEmulatorServer } from "./server.js";

const port = parseInt(process.env.OLA_PORT ?? "9090", 10);
const emulator = new DMXEmulatorServer(port);

emulator.start().then(() => {
  console.log(`DMX Emulator running at http://localhost:${port}/`);
  console.log(`Monitor UI: http://localhost:${port}/`);
  console.log(`Press Ctrl+C to stop`);
});

process.on("SIGINT", async () => {
  await emulator.stop();
  process.exit(0);
});
