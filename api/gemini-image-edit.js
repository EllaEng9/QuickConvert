// Parses multipart (image + instruction) and returns edited image bytes.
import Busboy from "busboy";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { fileBuffer, mimeType, instruction } = await readMultipart(req, {
      maxBytes: 20 * 1024 * 1024,                           // 20 MB guardrail
      allowed: ["image/png", "image/jpeg", "image/webp"]    // tighten if you want
    });

    if (!fileBuffer) return res.status(400).json({ error: "Missing image file" });
    if (!instruction?.trim()) return res.status(400).json({ error: "Missing instruction" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Prefer an image-capable model, then fall back.
    const candidates = ["gemini-2.5-flash-image-preview", "gemini-2.5-flash-image", "gemini-2.5-flash", "gemini-1.5-flash"];
    let response, used, lastErr;
    for (const name of candidates) {
      try {
        const model = genAI.getGenerativeModel({ model: name });
        response = await model.generateContent([
          { text: instruction },
          { inlineData: { mimeType, data: fileBuffer.toString("base64") } }
        ]);
        used = name;
        break;
      } catch (e) { lastErr = e; }
    }
    if (!response) throw lastErr || new Error("All model attempts failed");

    // Extract image part from response
    const parts = response?.response?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find(p => p.inlineData?.data);
    if (!img) {
      return res.status(501).json({
        error: `Model "${used}" did not return an image. Try enabling an image-capable tier (e.g., gemini-2.5-flash-image).`
      });
    }

    const outMime = img.inlineData.mimeType || "image/png";
    const buf = Buffer.from(img.inlineData.data, "base64");
    res.setHeader("Content-Type", outMime);
    res.status(200).send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Gemini error" });
  }
}

function readMultipart(req, { maxBytes, allowed }) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const chunks = [];
    let seenBytes = 0;
    let mimeType = "";
    let instruction = "";

    bb.on("file", (_name, file, info) => {
      mimeType = info.mimeType || "application/octet-stream";
      if (allowed && !allowed.includes(mimeType)) {
        file.resume();
        return reject(new Error(`Unsupported file type: ${mimeType}`));
      }
      file.on("data", (d) => {
        seenBytes += d.length;
        if (maxBytes && seenBytes > maxBytes) {
          file.resume();
          return reject(new Error("Image too large"));
        }
        chunks.push(d);
      });
    });

    bb.on("field", (name, val) => {
      if (name === "instruction") instruction = val;
    });

    bb.on("error", reject);
    bb.on("finish", () => resolve({ fileBuffer: Buffer.concat(chunks), mimeType, instruction }));
    req.pipe(bb);
  });
}
