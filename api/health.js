import { Pool } from "pg";

export const config = {
  runtime: "nodejs"
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  try {

    // =========================
    // GET → Health check simple
    // =========================
    if (req.method === "GET") {
      return res.status(200).json({ ok: true });
    }

    // =========================
    // POST → Actualizar presencia
    // =========================
    if (req.method === "POST") {

      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: "user_id requerido" });
      }

      await pool.query(
        `
        INSERT INTO presence (user_id, last_seen)
        VALUES ($1, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET last_seen = NOW()
        `,
        [user_id]
      );

      return res.status(200).json({ updated: true });
    }

    return res.status(405).json({ error: "Método no permitido" });

  } catch (err) {
    console.error("HEALTH ERROR:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
