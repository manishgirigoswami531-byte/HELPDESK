const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Home
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "HelpDesk API is running"
  });
});

// Health Check
app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    service: "HelpDesk API",
    status: "healthy"
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`HelpDesk API running on port ${PORT}`);
});
