import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {

    // 🔹 LOGIN NORMAL
    if (req.method === "POST") {

      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Missing credentials" });
      }

      const result = await pool.query(
        "SELECT * FROM users WHERE username = $1 AND is_active = true",
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = result.rows[0];

      const passwordMatch = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      return res.status(200).json({
  id: user.id,
  username: user.username,
  role: user.role,
  full_name: user.full_name,
  password_updated_at: user.password_updated_at
});
    }

    // 🔹 VALIDAR SESIÓN (para cierre automático)
    if (req.method === "GET") {

      const userId = req.query.user_id;

      if (!userId) {
        return res.status(400).json({ error: "Missing user_id" });
      }

      const result = await pool.query(
        "SELECT is_active FROM users WHERE id = $1",
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ active: false });
      }

      const user = await pool.query(
  "SELECT is_active, password_updated_at FROM users WHERE id = $1",
  [userId]
);

if (user.rows.length === 0) {
  return res.status(404).json({ active: false });
}

return res.status(200).json({
  active: user.rows[0].is_active,
  password_updated_at: user.rows[0].password_updated_at
});
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
