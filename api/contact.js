import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

let client;
let clientPromise;

// ✅ Reuse connection (Vercel best practice)
if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Only POST allowed" });
  }

  try {
    const c = req.body;

    // ❗ Basic validation
    if (!c || !c.fname || !c.email || !c.message) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const client = await clientPromise;
    const db = client.db("rcmstore"); // same DB
    const contacts = db.collection("contacts"); // new collection

    // ✅ Save contact data
    await contacts.insertOne({
      ...c,
      createdAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Contact saved",
    });

  } catch (err) {
    console.error("❌ Contact Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}