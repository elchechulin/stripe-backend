import { Pool } from "pg";

export const config = {
  runtime: "nodejs"
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    const result = await pool.query(
      "SELECT is_active, baja_at FROM users WHERE id = $1 AND role = 'closer' AND is_demo IS NOT TRUE",
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Closer not found" });
    }

    const closer = result.rows[0];

    // 🔹 SI ESTÁ ACTIVO → DAR DE BAJA
    if (closer.is_active) {

      await pool.query(
        "UPDATE users SET is_active = false, baja_at = NOW() WHERE id = $1",
        [user_id]
      );

      return res.status(200).json({
        status: "baja",
        message: "Closer dado de baja"
      });
    }

    // 🔹 SI ESTÁ DADO DE BAJA → REACTIVAR
    await pool.query(
      "UPDATE users SET is_active = true, baja_at = NULL WHERE id = $1",
      [user_id]
    );

    return res.status(200).json({
      status: "alta",
      message: "Closer reactivado"
    });

  } catch (err) {
    console.error("TOGGLE BAJA ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
