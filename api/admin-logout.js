export default function handler(req, res) {
  try {
    // ❌ Remove cookie (logout)
    res.setHeader(
      "Set-Cookie",
      "admin=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    );

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ success: false });
  }
}