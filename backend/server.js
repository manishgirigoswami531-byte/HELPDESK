
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

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
    status: "healthy",
    supabaseConfigured: Boolean(supabase)
  });
});

// Database Connection Check
app.get("/api/v1/db-check", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      message: "Supabase environment variables are missing"
    });
  }

  try {
    const { error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Database check failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Database check failed"
      });
    }

    return res.json({
      success: true,
      message: "Supabase database connected"
    });
  } catch (error) {
    console.error("Database error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Database connection failed"
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

app.listen(PORT, () => {
  console.log(`HelpDesk API running on port ${PORT}`);
});
  
