// POST /api/gemini-text  { prompt: string } -> { text: string }
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const { prompt } = req.body || {};
    if (!prompt?.trim()) return res.status(400).json({ error: "Missing prompt" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    res.status(200).json({ text: result.response.text() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Gemini error" });
  }
}
