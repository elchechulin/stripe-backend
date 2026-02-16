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

    // ====================================================
    // 🔐 POST (LOGIN + RESET PASSWORD)
    // ====================================================
    if (req.method === "POST") {

      // --------------------------------------------
      // 🔐 RESET PASSWORD (ADMIN)
      // --------------------------------------------
      if (req.body.mode === "reset_password") {

        const { user_id, admin_password } = req.body;

        if (!user_id || !admin_password) {
          return res.status(400).json({ error: "Missing data" });
        }

        const adminResult = await pool.query(
          "SELECT * FROM users WHERE role = 'admin' LIMIT 1"
        );

        if (adminResult.rows.length === 0) {
          return res.status(404).json({ error: "Admin not found" });
        }

        const admin = adminResult.rows[0];

        const adminPasswordMatch = await bcrypt.compare(
          admin_password,
          admin.password_hash
        );

        if (!adminPasswordMatch) {
          return res.status(401).json({ error: "Admin password incorrect" });
        }

        // Generar nueva contraseña
        const nuevaPassword = Math.random().toString(36).slice(-10);
        const newHash = await bcrypt.hash(nuevaPassword, 10);

        await pool.query(
          `
          UPDATE users
          SET password_hash = $1,
              password_updated_at = NOW()
          WHERE id = $2
          `,
          [newHash, user_id]
        );

        return res.status(200).json({
          success: true,
          new_password: nuevaPassword
        });
      }

      // --------------------------------------------
      // 🔑 LOGIN NORMAL
      // --------------------------------------------

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

    // ====================================================
    // 🔍 GET (VALIDAR SESIÓN)
    // ====================================================
    if (req.method === "GET") {

      const userId = req.query.user_id;

      if (!userId) {
        return res.status(400).json({ error: "Missing user_id" });
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
