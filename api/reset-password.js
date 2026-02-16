import { Pool } from "pg";
import bcrypt from "bcryptjs";

export const config = {
  runtime: "nodejs"
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Generador de password segura
function generarPassword(longitud = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < longitud; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { user_id, admin_password } = req.body;

    if (!user_id || !admin_password) {
      return res.status(400).json({ error: "Missing data" });
    }

    // 🔐 Verificar contraseña del admin
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

    // 🔄 Generar nueva contraseña
    const nuevaPassword = generarPassword();
    const newHash = await bcrypt.hash(nuevaPassword, 10);

    // 🔄 Actualizar usuario
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

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
