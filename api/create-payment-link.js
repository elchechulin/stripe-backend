import crypto from "crypto";

const SECRET = process.env.PAYMENT_TOKEN_SECRET;

export default function handler(req, res) {
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
    exp: Date.now() + 60 * 60 * 1000 // 1 hora
  };

  const token = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(token)
    .digest("hex");

  const signedToken = `${token}.${signature}`;

  return res.status(200).json({
    url: `https://pricing-restaurantes.vercel.app/pago-setup.html?token=${signedToken}`
  });
}
