import { MongoClient, ObjectId } from "mongodb";
import Razorpay from "razorpay";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===============================
// 🔐 COOKIE HELPERS (ADD HERE)
// ===============================
function getCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map(v => {
        const [k, ...val] = v.trim().split("=");
        return [k, val.join("=")];
      })
  );
}

function isAdmin(req) {
  const cookies = getCookies(req);
  return cookies.admin === "true";
}

const uri = process.env.MONGODB_URI;

let client;
let clientPromise;

// ✅ Reuse MongoDB connection (Vercel-safe)
if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}

clientPromise = global._mongoClientPromise;

// ✅ Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    const mongo = await clientPromise;
    const db = mongo.db("rcmstore");

    // ✅ Safe body parse (GLOBAL FIX)
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // 🔐 ADMIN LOGIN
    if (action === "admin-login") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, message: "Method not allowed" });
      }

      const { username, password } = body || {};

      if (!username || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
      }

      if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASS
      ) {
        res.setHeader(
          "Set-Cookie",
          "admin=true; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400"
        );

        return res.status(200).json({ success: true });
      }

      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // 🔓 ADMIN LOGOUT
    else if (action === "admin-logout") {
      res.setHeader(
        "Set-Cookie",
        "admin=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
      );

      return res.status(200).json({ success: true });
    }

    // 🔐 CHECK ADMIN
    else if (action === "check-admin") {
  return res.status(200).json({
    loggedIn: isAdmin(req),
  });
}

    // 📩 SAVE CONTACT
    else if (action === "contact") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, message: "Only POST allowed" });
      }

      if (!body || !body.fname || !body.email || !body.message) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      await db.collection("contacts").insertOne({
        ...body,
        createdAt: new Date(),
      });

      return res.status(200).json({
        success: true,
        message: "Contact saved",
      });
    }

    // 📥 GET CONTACTS
else if (action === "get-contacts") {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Only GET allowed",
    });
  }

  // 🔐 ADMIN CHECK (IMPORTANT FIX)
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    const data = await db
      .collection("contacts")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      contacts: data,
    });

  } catch (err) {
    console.error("Get Contacts Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

    // 💳 CREATE ORDER
    else if (action === "create-order") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const { amount } = body || {};

      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: "rcm-" + Date.now(),
      });

      return res.json(order);
    }

    // 🔑 GET KEY
    else if (action === "get-key") {
      return res.json({ key: process.env.RAZORPAY_KEY_ID });
    }

    // 📦 GET ORDERS (ADMIN ONLY)
else if (action === "get-orders") {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  // 🔐 ADMIN CHECK
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    const orders = await db
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // ✅ FIX: make _id frontend-safe + ensure consistent format
    const safeOrders = orders.map(o => ({
      ...o,
      _id: o._id?.toString(),
      orderId: o.orderId?.trim()?.toUpperCase(),
    }));

    return res.status(200).json({
      success: true,
      orders: safeOrders,
    });

  } catch (err) {
    console.error("Get Orders Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

    // 💾 SAVE ORDER
    else if (action === "save-order") {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
      }

      if (!body || !body.orderId) {
        return res.status(400).json({
          success: false,
          message: "Invalid order data",
        });
      }

      await db.collection("orders").insertOne({
        ...body,
        createdAt: new Date(),
      });

      return res.status(200).json({ success: true });
    }

    // 🔍 TRACK ORDER
else if (action === "track-order") {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  

  const { orderId } = body || {};

  if (!orderId) {
    return res.status(400).json({
      success: false,
      message: "Order ID required",
    });
  }

  try {
    const order = await db.collection("orders").findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });

  } catch (err) {
    console.error("Track Order Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

    // 🔄 UPDATE STATUS
else if (action === "update-status") {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST allowed",
    });
  }

  // 🔐 ADMIN CHECK (IMPORTANT FIX)
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const { orderId, status } = body || {};

  if (!orderId || !status) {
    return res.status(400).json({
      success: false,
      message: "Missing orderId or status",
    });
  }

  try {
    const result = await db.collection("orders").updateOne(
      { orderId },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Status updated",
    });

  } catch (err) {
    console.error("Update Status Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

    // ✅ VERIFY PAYMENT
    else if (action === "verify-payment") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false });
      }

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = body || {};

      const text = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(text)
        .digest("hex");

      return res.json({
        success: expectedSignature === razorpay_signature,
      });
    }

    

// ➕ ADD PRODUCT
else if (action === "add-product") {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST allowed",
    });
  }

  // 🔐 ADMIN CHECK
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    let imageUrl = null;

    // ☁️ CLOUDINARY UPLOAD
    if (body.image && body.image.startsWith("data:image")) {
      const uploadRes = await cloudinary.uploader.upload(body.image, {
        folder: "rcm_products",
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
      });

      imageUrl = uploadRes.secure_url;
    }

    // ✅ PRODUCT DATA (UPDATED WITH VARIANT)
    const productData = {
      name: body.name || "",
      category: body.category || "",
      price: Number(body.price || 0),
      mrp: Number(body.mrp || 0),
      stock: Number(body.stock || 0),
      sku: body.sku || "",
      desc: body.desc || "",

      // 🔥 ADD THIS LINE (IMPORTANT FIX)
      weight: body.variant || "",

      tags: Array.isArray(body.tags) ? body.tags : [],
      image: imageUrl,
      createdAt: new Date(),
    };

    const result = await db.collection("products").insertOne(productData);

    return res.status(200).json({
      success: true,
      message: "Product added",
      product: {
        _id: result.insertedId.toString(),
        ...productData,
      },
    });

  } catch (err) {
    console.error("Add Product Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add product",
    });
  }
}


// ❌ DELETE PRODUCT
else if (action === "delete-product") {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST allowed",
    });
  }

  // 🔐 ADMIN CHECK
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const { id } = body || {};

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Product ID required",
    });
  }

  try {
    const product = await db.collection("products").findOne({
      _id: new ObjectId(id),
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ☁️ DELETE FROM CLOUDINARY (SAFE)
    if (product.image) {
      try {
        const urlParts = product.image.split("/upload/");
        if (urlParts.length > 1) {
          const publicIdWithExt = urlParts[1];
          const publicId = publicIdWithExt.substring(
            0,
            publicIdWithExt.lastIndexOf(".")
          );

          await cloudinary.uploader.destroy(publicId);
        }
      } catch (e) {
        console.warn("Cloudinary delete failed:", e.message);
      }
    }

    await db.collection("products").deleteOne({
      _id: new ObjectId(id),
    });

    return res.status(200).json({
      success: true,
      message: "Product deleted",
    });

  } catch (err) {
    console.error("Delete Product Error:", err);
    return res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
}


// ✏️ UPDATE PRODUCT (ADMIN)
else if (action === "update-product") {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Only POST allowed",
    });
  }

  // 🔐 ADMIN CHECK (FIXED)
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const { id, image, ...updateData } = body || {};

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Product ID required",
    });
  }

  try {
    let imageUrl = null;

    // ☁️ UPLOAD NEW IMAGE
    if (image && image.startsWith("data:image")) {
      const uploadRes = await cloudinary.uploader.upload(image, {
        folder: "rcm_products",
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
      });

      imageUrl = uploadRes.secure_url;

      // 🗑️ DELETE OLD IMAGE (SAFE)
      const oldProduct = await db.collection("products").findOne({
        _id: new ObjectId(id),
      });

      if (oldProduct?.image) {
        try {
          const urlParts = oldProduct.image.split("/upload/");
          const publicId = urlParts[1].split(".")[0];

          await cloudinary.uploader.destroy(publicId);
        } catch (e) {
          console.warn("Cloudinary delete failed:", e.message);
        }
      }
    }

    const finalUpdate = { ...updateData };

    if (imageUrl) {
      finalUpdate.image = imageUrl;
    }

    await db.collection("products").updateOne(
      { _id: new ObjectId(id) },
      { $set: finalUpdate }
    );

    return res.status(200).json({
      success: true,
      message: "Product updated",
    });

  } catch (err) {
    console.error("Update Product Error:", err);
    return res.status(500).json({
      success: false,
      message: "Update failed",
    });
  }
}

// 📊 DASHBOARD DATA
else if (action === "dashboard") {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false });
  }

  // 🔐 ADMIN CHECK (IMPORTANT FIX)
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    const orders = await db.collection("orders").find({}).toArray();
    const contacts = await db.collection("contacts").find({}).toArray();

    const totalRevenue = orders.reduce(
      (sum, o) => sum + Number(o.grandTotal || 0),
      0
    );

    const uniqueCustomers = new Set(
      orders.map(o => o.phone).filter(Boolean)
    ).size;

    return res.status(200).json({
      success: true,
      totalOrders: orders.length,
      totalCustomers: uniqueCustomers,
      totalRevenue,
      totalMessages: contacts.length,
    });

  } catch (err) {
    console.error("Dashboard Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}


// 👥 GET CUSTOMERS
else if (action === "get-customers") {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  // 🔐 ADMIN CHECK (IMPORTANT FIX)
  if (!isAdmin(req)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    const orders = await db
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const map = {};

    orders.forEach(o => {
      const key = o.phone || "unknown";

      if (!map[key]) {
        map[key] = {
          fname: o.fname || "",
          lname: o.lname || "",
          phone: o.phone || "",
          email: o.email || "",
          orderCount: 0,
        };
      }

      map[key].orderCount += 1;
    });

    return res.status(200).json({
      success: true,
      customers: Object.values(map),
    });

  } catch (err) {
    console.error("Get Customers Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

// 📦 GET PRODUCTS (PUBLIC)
else if (action === "get-products") {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const products = await db
      .collection("products")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      products,
    });

  } catch (err) {
    console.error("Get Products Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}


// 📧 SEND OTP (SIGNUP / LOGIN)
else if (action === "send-otp") {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Only POST allowed" });
  }

  const { email, type } = body || {};
  if (!email) return res.status(400).json({ success: false, message: "Email required" });

  // Check if user exists (for login vs signup)
  const existingUser = await db.collection("users").findOne({ email });

  if (type === "signup" && existingUser) {
    return res.status(400).json({ success: false, message: "Email already registered. Please login." });
  }

  if (type === "login" && !existingUser) {
    return res.status(404).json({ success: false, message: "No account found. Please sign up first." });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

  // Save OTP to DB (overwrite any existing)
  await db.collection("otps").deleteMany({ email });
  await db.collection("otps").insertOne({ email, otp, expiresAt });

  // Send OTP email via Gmail
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"RCM Store" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Your RCM Store OTP Code",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:32px;border:1px solid #eee;border-radius:12px;">
        <h2 style="color:#16a34a;">RCM Store</h2>
        <p>Your One-Time Password is:</p>
        <div style="font-size:40px;font-weight:bold;letter-spacing:10px;color:#1e1e1c;margin:24px 0;">
          ${otp}
        </div>
        <p style="color:#888;font-size:13px;">This OTP expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
      </div>
    `,
  });

  return res.status(200).json({ success: true, message: "OTP sent to " + email });
}

// ✅ VERIFY OTP + SIGNUP
else if (action === "verify-signup") {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const { email, otp, name, password } = body || {};

  if (!email || !otp || !name || !password) {
    return res.status(400).json({ success: false, message: "All fields required" });
  }

  // Check OTP
  const otpRecord = await db.collection("otps").findOne({ email });

  if (!otpRecord) {
    return res.status(400).json({ success: false, message: "OTP expired. Request a new one." });
  }

  if (otpRecord.otp !== otp) {
    return res.status(400).json({ success: false, message: "Incorrect OTP" });
  }

  if (new Date() > new Date(otpRecord.expiresAt)) {
    return res.status(400).json({ success: false, message: "OTP expired. Request a new one." });
  }

  // Hash password
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.default.hash(password, 10);

  // Save user
  await db.collection("users").insertOne({
    name,
    email,
    passwordHash,
    createdAt: new Date(),
  });

  // Delete used OTP
  await db.collection("otps").deleteMany({ email });

  // Issue JWT session cookie
  const jwt = await import("jsonwebtoken");
  const token = jwt.default.sign({ email, name }, process.env.JWT_SECRET, { expiresIn: "7d" });

  res.setHeader("Set-Cookie", `userToken=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=604800`);

  return res.status(200).json({ success: true, message: "Account created!", name });
}

// ✅ VERIFY OTP + LOGIN
else if (action === "verify-login") {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false });
  }

  const { email, otp, password } = body || {};

  if (!email || !otp || !password) {
    return res.status(400).json({ success: false, message: "All fields required" });
  }

  // Check OTP
  const otpRecord = await db.collection("otps").findOne({ email });

  if (!otpRecord || otpRecord.otp !== otp) {
    return res.status(400).json({ success: false, message: "Incorrect or expired OTP" });
  }

  if (new Date() > new Date(otpRecord.expiresAt)) {
    return res.status(400).json({ success: false, message: "OTP expired. Request a new one." });
  }

  // Check user + password
  const user = await db.collection("users").findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.default.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ success: false, message: "Wrong password" });

  // Delete used OTP
  await db.collection("otps").deleteMany({ email });

  // Issue JWT
  const jwt = await import("jsonwebtoken");
  const token = jwt.default.sign({ email, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });

  res.setHeader("Set-Cookie", `userToken=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=604800`);

  return res.status(200).json({ success: true, message: "Logged in!", name: user.name });
}

// 🔓 USER LOGOUT
else if (action === "user-logout") {
  res.setHeader("Set-Cookie", "userToken=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return res.status(200).json({ success: true });
}

// 👤 CHECK USER SESSION
else if (action === "check-user") {
  const cookies = getCookies(req);
  const token = cookies.userToken;

  if (!token) return res.status(200).json({ loggedIn: false });

  try {
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({ loggedIn: true, name: decoded.name, email: decoded.email });
  } catch {
    return res.status(200).json({ loggedIn: false });
  }
} 

    // ❌ DEFAULT
    else {
      return res.status(404).json({ message: "Invalid API route" });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}