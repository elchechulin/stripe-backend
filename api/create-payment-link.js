import crypto from "crypto";

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const SECRET = process.env.PAYMENT_TOKEN_SECRET;
  if (!SECRET) {
    return res.status(500).json({
      error: "Server misconfiguration: missing PAYMENT_TOKEN_SECRET"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mensualidad, setup } = req.body;
  if (!mensualidad || !setup) {
    return res.status(400).json({ error: "Missing payment data" });
  }

  const payload = {
    mensualidad,
    setup,
    exp: Date.now() + 60 * 60 * 1000
  };

  const token = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(token)
    .digest("hex");

  return res.status(200).json({
    url: `https://pricing-restaurantes.vercel.app/pago-setup.html?token=${token}.${signature}`
  });
}
