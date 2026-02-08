import crypto from "crypto";

const links = global.links || new Map();
global.links = links;

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { modo, mensualidad, setup } = req.body;

  if (!modo || !mensualidad) {
    return res.status(400).json({ error: "Missing data" });
  }

  if (modo === "setup" && !setup) {
    return res.status(400).json({ error: "Missing setup" });
  }

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hora

  links.set(token, {
    modo,
    mensualidad,
    setup,
    expiresAt,
    used: false
  });

  const url = `https://pricing-restaurantes.vercel.app/pago-${modo}.html?token=${token}`;

  res.status(200).json({ url, expiresAt });
}
