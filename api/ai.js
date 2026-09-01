/* ============================================================
   /api/ai.js — Sports Stock App
   ------------------------------------------------------------
   Save this as  api/ai.js  in the ROOT of your project
   (alongside package.json, NOT inside src/).

   Vercel turns anything in /api into a serverless function, so
   this becomes available at  /api/ai  once deployed. Its whole
   job is to hold the Anthropic API key server-side and pass
   requests through, so the key never reaches the browser.

   Then set, at the top of src/App.jsx:
       const AI_ENDPOINT = "/api/ai";

   And in Vercel → Settings → Environment Variables add:
       ANTHROPIC_API_KEY = sk-ant-...
   ============================================================ */

const ALLOWED_MODELS = ["claude-sonnet-4-6"];
const MAX_TOKENS = 1200;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
  }

  const { model, system, messages, max_tokens } = req.body || {};

  // Only let through the shapes this app actually sends — the endpoint is
  // public once deployed, so don't forward arbitrary requests on your key.
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages required" });
  }
  if (model && !ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: "model not allowed" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || ALLOWED_MODELS[0],
        max_tokens: Math.min(max_tokens || 800, MAX_TOKENS),
        system,
        messages,
      }),
    });

    const data = await r.json();
    if (!r.ok) console.error("Anthropic error:", r.status, data);
    return res.status(r.status).json(data);
  } catch (err) {
    console.error("Proxy failed:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}

/* ------------------------------------------------------------
   Photos are sent as base64 inside the JSON body, so bodies run
   to a few hundred KB. If Vercel rejects a scan as too large,
   add this to vercel.json in the project root:

   {
     "functions": {
       "api/ai.js": { "maxDuration": 30 }
     }
   }

   The app already shrinks images to ~900px before sending, which
   keeps a four-photo scan comfortably inside the default limits.
   ------------------------------------------------------------ */
