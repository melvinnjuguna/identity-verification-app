import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

//  BOOTSTRAP

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ENVIRONMENT GUARD

const REQUIRED_ENV = ["KYC_API_URL", "KYC_API_TOKEN", "REDIRECT_LINK"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `[FATAL] Missing required environment variables: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const KYC_API_URL = process.env.KYC_API_URL;
const KYC_API_TOKEN = process.env.KYC_API_TOKEN;
const REDIRECT_LINK = process.env.REDIRECT_LINK;
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "production";
const IS_PROD = NODE_ENV === "production";

// CORE MIDDLEWARE

app.set("trust proxy", 1); // Required for correct IP behind code.run / nginx

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: false }));

// SECURITY HEADERS
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://googleapis.com; " +
      "font-src 'self' https://gstatic.com; " +
      "img-src 'self' data: blob:; " +
      "connect-src 'self'; " +
      "media-src 'self' blob:; " +
      "worker-src blob:;",
  );
  next();
});

// REQUEST LOGGING

app.use((req, _res, next) => {
  const isAsset = /\.(js|css|webp|png|jpg|ico|woff2?)$/i.test(req.path);
  if (!IS_PROD || !isAsset) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
      }),
    );
  }
  next();
});

// RATE LIMITERS

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many verification attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests.",
});

// VALIDATION SCHEMA

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const iso3Regex = /^[A-Z]{3}$/;

const VerificationSchema = z.object({
  whatsApp_number: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, {
      message: "Must be a valid international number (digits only, 7–15 chars)",
    }),

  document_type: z.enum(["card", "book", "passport"], {
    errorMap: () => ({ message: "Must be: card | book | passport" }),
  }),

  user_declared: z.object({
    identity_number: z.string().trim().min(1, "Required"),
    first_names: z.string().trim().min(1, "Required"),
    surname: z.string().trim().min(1, "Required"),
  }),

  ocr_extracted: z.object({
    identity_number: z.string().trim().nullable(),
    first_names: z.string().trim().nullable(),
    surname: z.string().trim().nullable(),
    dob: z
      .string()
      .regex(dateRegex, { message: "Must match YYYY-MM-DD" })
      .nullable(),
    gender: z.enum(["male", "female", "unknown"], {
      errorMap: () => ({ message: "Must be: male | female | unknown" }),
    }),
    citizenship_status: z.enum(["citizen", "permanent_resident"]).nullable(),
    passport_metadata: z
      .object({
        nationality: z
          .string()
          .regex(iso3Regex, { message: "Must be a 3-letter ISO code" })
          .nullable(),
        issuing_country: z
          .string()
          .regex(iso3Regex, { message: "Must be a 3-letter ISO code" })
          .nullable(),
        expiry_date: z
          .string()
          .regex(dateRegex, { message: "Must match YYYY-MM-DD" })
          .nullable(),
        raw_mrz_line1: z
          .string()
          .length(44, { message: "Must be exactly 44 characters" })
          .nullable(),
        raw_mrz_line2: z
          .string()
          .length(44, { message: "Must be exactly 44 characters" })
          .nullable(),
      })
      .nullable()
      .default(null),
  }),

  _meta: z.object({
    identity_match: z.boolean(),
  }),

  images: z.object({
    id_image: z
      .string()
      .startsWith("data:image/", { message: "Must be a valid base64 data URI" })
      .nullable(),
    selfie_image: z
      .string()
      .startsWith("data:image/", { message: "Must be a valid base64 data URI" })
      .nullable(),
  }),
});

// ROUTES

// ── Health check ──────
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", ts: new Date().toISOString() });
});

// ── Secure WhatsApp Registration Route ──────
app.get("/register/:whatsappNumber", registerLimiter, (req, res) => {
  const { whatsappNumber } = req.params;

  if (!/^\d{7,15}$/.test(whatsappNumber)) {
    return res.status(400).send("Invalid verification link.");
  }

  // Set the structural fallback state cookie
  res.cookie("wa_num", whatsappNumber, {
    maxAge: 30 * 60 * 1000, 
    httpOnly: false,      
    secure: true,           
    sameSite: "Lax",
    path: "/"             
  });

  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── KYC verification proxy ──────
app.post("/verify", verifyLimiter, async (req, res) => {
  const targetWhatsApp = String(
    req.query.wa || req.body?.whatsApp_number || "",
  ).trim();

  const parseResult = VerificationSchema.safeParse({
    ...req.body,
    whatsApp_number: targetWhatsApp,
  });

  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  let upstreamResponse;
  let rawBody;

  try {
    upstreamResponse = await fetch(KYC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": KYC_API_TOKEN,
      },
      body: JSON.stringify(parseResult.data),
    });

    rawBody = await upstreamResponse.text();
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "upstream_network_error",
        error: err.message,
      }),
    );
    return res.status(502).json({
      success: false,
      error: "Upstream service unavailable. Please try again shortly.",
    });
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!upstreamResponse.ok) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "upstream_error",
        status: upstreamResponse.status,
        body: rawBody.slice(0, 300),
      }),
    );

    if (isJson) {
      try {
        return res.status(upstreamResponse.status).json(JSON.parse(rawBody));
      } catch {
        // Upstream JSON anomaly handler
      }
    }

    return res.status(upstreamResponse.status).json({
      success: false,
      reason: rawBody.slice(0, 500),
    });
  }

  let upstreamJson = {};
  if (isJson) {
    try {
      upstreamJson = JSON.parse(rawBody);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Upstream returned malformed JSON.",
      });
    }
  }

  return res.status(200).json({
    ...upstreamJson,
    success: true,
    message: "KYC submitted successfully",
    redirectLink: REDIRECT_LINK,
  });
});

// STATIC ASSETS
app.use(express.static(path.join(__dirname, "public")));

// ── CRUCIAL STANDALONE FIX: SPA Fallback Router ───
// This catches standalone loads at root '/' and displays index.html safely
app.get("*", (req, res, next) => {
  // Ignore backend API endpoint or asset routes
  if (req.path.startsWith("/verify") || req.path.startsWith("/health")) return next();
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 404 HANDLER
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found." });
});

// GLOBAL ERROR HANDLER
app.use((err, _req, res, _next) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "unhandled_error",
      error: err.message,
      stack: IS_PROD ? undefined : err.stack,
    }),
  );
  res.status(500).json({
    success: false,
    error: IS_PROD ? "Internal server error." : err.message,
  });
});

// GRACEFUL SHUTDOWN
let server;

function shutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}. Closing server…`);
  server.close(() => {
    console.log("[SHUTDOWN] All connections closed. Exiting.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[SHUTDOWN] Forced exit after timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// START
server = app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "server_start",
      port: PORT,
      env: NODE_ENV,
    }),
  );
});
