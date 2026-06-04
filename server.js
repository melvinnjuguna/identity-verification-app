import "dotenv/config";
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static("public"));

app.post("/verify", async (req, res) => {
  console.log("\n[KYC] Submission received");
  console.log("[KYC] document_type:", req.body.document_type);
  console.log("[KYC] user_declared:", JSON.stringify(req.body.user_declared));
  console.log("[KYC] whatsApp_number:", req.body.whatsApp_number);
  console.log("[KYC] id_image present:", !!req.body.images?.id_image);
  console.log("[KYC] selfie_image present:", !!req.body.images?.selfie_image);

  try {
    // Read the phone number from query params (?wa=) or fallback to the JSON body
    const whatsAppNumber = req.query.wa || req.body.whatsApp_number || "";

    const payload = {
      whatsApp_number: whatsAppNumber,
      document_type: req.body.document_type,
      images: {
        id_image: req.body.images?.id_image || null,
        selfie_image: req.body.images?.selfie_image || null,
      },
      user_declared: {
        identity_number: req.body.user_declared?.identity_number || "",
        first_names: req.body.user_declared?.first_names || "",
        surname: req.body.user_declared?.surname || "",
      },
      ocr_extracted: {
        identity_number: req.body.ocr_extracted?.identity_number || null,
        first_names: req.body.ocr_extracted?.first_names || null,
        surname: req.body.ocr_extracted?.surname || null,
        dob: req.body.ocr_extracted?.dob || null,
        gender: req.body.ocr_extracted?.gender || null,
        citizenship_status: req.body.ocr_extracted?.citizenship_status ?? null,
        passport_metadata: req.body.ocr_extracted?.passport_metadata ?? null,
      },
    };

    console.log(
      "[KYC] Forwarding payload:",
      JSON.stringify(
        {
          ...payload,
          images: { id_image: "<<omitted>>", selfie_image: "<<omitted>>" },
        },
        null,
        2,
      ),
    );

    const resp = await fetch(process.env.KYC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.KYC_API_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    console.log("[KYC] Upstream API status:", resp.status);
    const contentType = resp.headers.get("content-type") || "";

    // ── Handle plain-text error validation formats from the server
    if (!resp.ok && contentType.includes("text/plain")) {
      const errorText = await resp.text();
      console.log("[KYC] Upstream API Plain Text Error:", errorText);
      return res.status(resp.status).json({ 
        success: false, 
        reason: errorText 
      });
    }

    // ── Standard JSON parsing for standard API lifecycle outputs
    const data = await resp.json();
    console.log("[KYC] Upstream API response JSON:", JSON.stringify(data));
    
    res.status(resp.status).json(data);

  } catch (err) {
    console.error("[KYC] Proxy server tracking error:", err);
    res.status(500).json({ 
      success: false,
      error: "Verification request failed", 
      details: err.message 
    });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
