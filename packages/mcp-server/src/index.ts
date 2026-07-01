import { startServer } from "./server.js";

startServer().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
