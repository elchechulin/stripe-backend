import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mensualidad, setup = 0, modo = "inmediato" } = req.body;

  if (typeof mensualidad !== "number" || mensualidad <= 0) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  const payload = {
    mensualidad,
    setup: setup || 0,
    modo, // "inmediato" | "setup"
    exp: Date.now() + 15 * 60 * 1000
  };

  const payloadB64 = Buffer
    .from(JSON.stringify(payload))
    .toString("base64url");

  const signature = crypto
    .createHmac("sha256", process.env.PAYMENT_TOKEN_SECRET)
    .update(payloadB64)
    .digest("hex");

  const token = `${payloadB64}.${signature}`;

  const page =
    modo === "inmediato"
      ? "pago-inmediato.html"
      : "pago-setup.html";

  const url = `https://pricing-restaurantes.vercel.app/${page}?token=${token}`;

  return res.status(200).json({ url });
}
