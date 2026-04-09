export default function handler(req, res) {
  try {
    // ✅ Allow only POST
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        message: "Method not allowed"
      });
    }

    const { username, password } = req.body;

    // ✅ Check empty fields
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing credentials"
      });
    }

    // ✅ Validate admin
    if (
      username === process.env.ADMIN_USER &&
      password === process.env.ADMIN_PASS
    ) {
      // 🔐 IMPORTANT: secure cookie for Vercel (HTTPS)
      res.setHeader(
        "Set-Cookie",
        "admin=true; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400"
      );

      return res.status(200).json({ success: true });
    }

    // ❌ Wrong credentials
    return res.status(401).json({
      success: false,
      message: "Invalid credentials"
    });

  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}