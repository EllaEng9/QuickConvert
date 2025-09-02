// POST /api/gemini-image-edit
// { instruction: string, image: { mimeType: string, data: string(base64 without prefix) } }
// -> returns raw image bytes
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { instruction, image } = req.body || {};
    if (!instruction?.trim()) return res.status(400).json({ error: "Missing instruction" });
    if (!image?.data || !image?.mimeType) return res.status(400).json({ error: "Missing image" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      { text: instruction },
      { inlineData: { mimeType: image.mimeType, data: image.data } }
    ]);

    const parts = result?.response?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find(p => p.inlineData?.data);
    if (!img) {
      return res.status(501).json({
        error: "No image returned by this model/account. Try a different Gemini model tier."
      });
    }

    const buf = Buffer.from(img.inlineData.data, "base64");
    res.setHeader("Content-Type", img.inlineData.mimeType || "image/png");
    res.status(200).send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Gemini error" });
  }
}
