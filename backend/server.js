
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

function requireDatabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      message: "Database is not configured"
    });
  }
  next();
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required"
      });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    req.authUser = data.user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Authentication failed"
    });
  }
}

async function requireStaff(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select('"Role"')
      .eq("id", req.authUser.id)
      .maybeSingle();

    if (error) throw error;

    const role = String(data?.Role || "").toLowerCase();

    if (!["admin", "employee"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Only Admin or Employee can perform this action"
      });
    }

    next();
  } catch (error) {
    console.error("Staff authorization failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify staff permissions"
    });
  }
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "HelpDesk API is running"
  });
});

app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    service: "HelpDesk API",
    status: "healthy",
    supabaseConfigured: Boolean(supabase)
  });
});

app.get("/api/v1/db-check", requireDatabase, async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .limit(1);

  if (error) {
    return res.status(500).json({
      success: false,
      message: "Database check failed"
    });
  }

  res.json({
    success: true,
    message: "Supabase database connected",
    querySuccessful: true,
    rowsReturned: data.length
  });
});

// List service requests for authorized staff.
app.get(
  "/api/v1/admin/requests",
  requireDatabase,
  requireAuth,
  requireStaff,
  async (req, res) => {
    const { data, error } = await supabase
      .from("Service requests")
      .select("*")
      .order("Created at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Could not load service requests"
      });
    }

    res.json({ success: true, requests: data });
  }
);

// List available workers for authorized staff.
app.get(
  "/api/v1/admin/workers",
  requireDatabase,
  requireAuth,
  requireStaff,
  async (req, res) => {
    const { data, error } = await supabase
      .from("Workers")
      .select("*")
      .eq("Is available", true)
      .order("name", { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Could not load available workers"
      });
    }

    res.json({ success: true, workers: data });
  }
);

// Explicit staff-selected assignment. No automatic assignment.
app.post(
  "/api/v1/assignments",
  requireDatabase,
  requireAuth,
  requireStaff,
  async (req, res) => {
    const requestId = req.body?.requestId;
    const workerId = req.body?.workerId;

    if (
      typeof requestId !== "string" ||
      typeof workerId !== "string" ||
      !requestId.trim() ||
      !workerId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "requestId and workerId are required"
      });
    }

    try {
      const { data: request, error: requestError } =
        await supabase
          .from("Service requests")
          .select("*")
          .eq("id", requestId)
          .maybeSingle();

      if (requestError) throw requestError;

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Service request not found"
        });
      }

      const { data: worker, error: workerError } =
        await supabase
          .from("Workers")
          .select("*")
          .eq("id", workerId)
          .maybeSingle();

      if (workerError) throw workerError;

      if (!worker) {
        return res.status(404).json({
          success: false,
          message: "Worker not found"
        });
      }

      if (worker["Is available"] !== true) {
        return res.status(409).json({
          success: false,
          message: "Selected worker is not available"
        });
      }

      const requestType = String(request["Service type"] || "")
        .trim().toLowerCase();
      const workerType = String(worker["Service type"] || "")
        .trim().toLowerCase();

      if (requestType && workerType && requestType !== workerType) {
        return res.status(409).json({
          success: false,
          message: "Worker service type does not match this request"
        });
      }

      const { data: existing, error: existingError } =
        await supabase
          .from("assignments")
          .select("id")
          .eq("Request id", requestId)
          .limit(1);

      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: "This request already has an assignment"
        });
      }

      const { data: assignment, error: insertError } =
        await supabase
          .from("assignments")
          .insert({
            "Request id": requestId,
            "Worker id": workerId,
            assigned_by: req.authUser.id,
            Status: "Assigned"
          })
          .select("*")
          .single();

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("Service requests")
        .update({ Status: "Assigned" })
        .eq("id", requestId);

      if (updateError) {
        // Undo the assignment if request status could not be updated.
        const { error: rollbackError } = await supabase
          .from("assignments")
          .delete()
          .eq("id", assignment.id);

        if (rollbackError) {
          console.error("Assignment rollback failed:", rollbackError.message);
        }

        throw updateError;
      }

      return res.status(201).json({
        success: true,
        message: "Worker manually assigned successfully",
        assignment
      });
    } catch (error) {
      console.error("Assignment failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Assignment failed; check server logs"
      });
    }
  }
);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

app.listen(PORT, () => {
  console.log(`HelpDesk API running on port ${PORT}`);
});
        
