import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
  // ✅ ONLY GET allowed
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET allowed",
    });
  }

  try {
    const client = await clientPromise;
    const db = client.db("rcmstore");
    const contacts = db.collection("contacts");

    // ✅ Get all contacts (latest first)
    const data = await contacts
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      contacts: data,
    });

  } catch (err) {
    console.error("❌ Fetch Contacts Error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}