export const config = {
  runtime: "nodejs"
};

global.demoUsers = global.demoUsers || [];

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { username } = req.body;

    global.demoUsers = global.demoUsers.filter(
      u => u.username !== username
    );

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
