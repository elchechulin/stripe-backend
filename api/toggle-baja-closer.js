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

    const current = await pool.query(
      "SELECT is_active FROM users WHERE id = $1",
      [user_id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const isActive = current.rows[0].is_active;

    if (isActive) {
      // DAR DE BAJA
      await pool.query(
        `
        UPDATE users
        SET is_active = false,
            baja_at = NOW()
        WHERE id = $1
        `,
        [user_id]
      );
    } else {
      // REACTIVAR
      await pool.query(
  `
  UPDATE users
  SET is_active = true,
      baja_at = NULL,
      commission_start_at = NOW()
  WHERE id = $1
  `,
  [user_id]
);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("TOGGLE BAJA ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
