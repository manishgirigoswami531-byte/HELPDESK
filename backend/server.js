
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized");
  } catch (error) {
    console.error("Supabase initialization failed:", error.message);
  }
} else {
  console.error("Supabase environment variables are missing");
}

// Home route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "HelpDesk API is running"
  });
});

// Health check
app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    service: "HelpDesk API",
    status: "healthy",
    supabaseConfigured: Boolean(supabase)
  });
});

// Database diagnostic
app.get("/api/v1/db-check", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      message: "Supabase environment variables are missing"
    });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Database diagnostic:", {
        message: error.message,
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null
      });

      return res.status(500).json({
        success: false,
        message: "Database check failed"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Supabase database connected",
      querySuccessful: true,
      rowsReturned: data.length
    });
  } catch (error) {
    console.error("Database exception:", error.message);

    return res.status(500).json({
      success: false,
      message: "Database connection failed"
    });
  }
});

// 404 handler
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
    
