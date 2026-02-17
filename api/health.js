import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "nodejs"
};

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {

  // 🔓 CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ IMPORTANTE: manejar preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    if (req.method === "GET") {
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: "user_id requerido" });
      }

      await sql`
        INSERT INTO presence (user_id, last_seen)
        VALUES (${user_id}, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET last_seen = NOW()
      `;

      return res.status(200).json({ updated: true });
    }

    return res.status(405).json({ error: "Método no permitido" });

  } catch (err) {
    console.error("HEALTH ERROR:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
