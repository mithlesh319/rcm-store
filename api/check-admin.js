export default function handler(req, res) {
  try {
    const cookies = req.headers.cookie || "";

    // ✅ Check if admin cookie exists
    if (cookies.includes("admin=true")) {
      return res.status(200).json({ loggedIn: true });
    }

    return res.status(200).json({ loggedIn: false });

  } catch (error) {
    return res.status(500).json({ loggedIn: false });
  }
}