import bcrypt from "bcryptjs";

export const config = {
  runtime: "nodejs"
};

// ===============================
// USUARIOS DEMO EN MEMORIA
// ===============================
global.demoUsers = global.demoUsers || [];

function generarPassword(longitud = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < longitud; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function generarUsername() {
  return "demo_" + Math.floor(Math.random() * 100000);
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

    const username = generarUsername();
    const plainPassword = generarPassword();
    const password_hash = await bcrypt.hash(plainPassword, 10);

    const demoUser = {
      id: Date.now(),
      username,
      password_hash,
      full_name: "Usuario Demo"
    };

    global.demoUsers.push(demoUser);

    return res.status(200).json({
      username,
      password: plainPassword
    });

  } catch (err) {
    console.error("CREATE DEMO USER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
