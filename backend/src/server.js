require("./config/env");

const app = require("./app");
const config = require("./config/env");
const pool = require("./config/database");

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("Database connected");

    app.listen(config.port, () => {
      console.log(`Server running on http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();