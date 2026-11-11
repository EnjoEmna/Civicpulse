require("./config/env");

const app = require("./app");
const config = require("./config/env");
const pool = require("./config/database");
const { startJobRunner, stopJobRunner } = require("./jobs/retry.job");

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("Database connected");

    startJobRunner({ intervalMs: 60000, runBackfillOnStart: true });

    const server = app.listen(config.port, () => {
      console.log(`Server running on http://localhost:${config.port}`);
    });

    const shutdown = () => {
      stopJobRunner();
      server.close(() => process.exit(0));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();
