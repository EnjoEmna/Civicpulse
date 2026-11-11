const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const apiRoutes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const { UPLOAD_ROOT } = require("./config/storage");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_ROOT));
app.use("/api/v1", apiRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CivicPulse backend is running",
  });
});

app.use(errorHandler);

module.exports = app;
