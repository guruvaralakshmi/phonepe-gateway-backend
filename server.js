require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { encode } = require("js-base64");
const sha256 = require("js-sha256");
const mongoose = require("mongoose"); 

const app = express();
app.use(express.json());
app.use(cors());

// 🔹 MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.error("MongoDB Connection Error:", err));

// 🔹 Transaction Schema
const TransactionSchema = new mongoose.Schema({
  mobile: String,
  transactionId: String,
  amount: Number,
  status: { type: String, default: "PENDING" }, // PENDING, SUCCESS, FAILED
  createdAt: { type: Date, default: Date.now },
});
const Transaction = mongoose.model("Transaction", TransactionSchema);

// 🔹 Environment Variables
const MERCHANT_ID = process.env.MERCHANT_ID;
const SALT_KEY = process.env.SALT_KEY;
const SALT_INDEX = process.env.SALT_INDEX;
const PHONEPE_BASE_URL = "https://api-preprod.phonepe.com/apis/hermes";

// 🔹 Generate Transaction ID
const generateTransactionId = () => `T${Date.now()}${Math.floor(Math.random() * 1000000)}`;

// 🔹 Initiate Payment API
app.post("/initiate-payment", async (req, res) => {
  try {
    const { mobile, amount } = req.body;

    if (!mobile || !amount) {
      return res.status(400).json({ success: false, message: "Mobile number and amount are required" });
    }

    const transactionId = generateTransactionId();

    // 🔹 Save Transaction to DB (Initial Status: PENDING)
    const transaction = new Transaction({ mobile, transactionId, amount, status: "PENDING" });
    await transaction.save();

    const requestBody = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      merchantUserId: `user-${mobile}`,
      amount: Math.round(amount * 100),
      mobileNumber: mobile,
      callbackUrl: `${process.env.BASE_URL}/payment-callback`,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const apiEndpoint = "/pg/v1/pay";
    const payload = encode(JSON.stringify(requestBody));
    const checksum = sha256(payload + apiEndpoint + SALT_KEY) + "###" + SALT_INDEX;

    const response = await axios.post(
      `${PHONEPE_BASE_URL}${apiEndpoint}`,
      { request: payload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
        },
      }
    );

    console.log("PhonePe Response:", response.data);

    if (response.data.success) {
      const redirectUrl = response.data.data.instrumentResponse.redirectInfo.url;
      return res.json({ success: true, redirectUrl, transactionId });
    } else {
      await Transaction.updateOne({ transactionId }, { $set: { status: "FAILED" } });
      return res.status(400).json({ success: false, message: "Payment initiation failed" });
    }
  } catch (error) {
    console.error("Payment Error:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Payment processing failed", error: error.response?.data || error.message });
  }
});

// 🔹 Payment Callback API (Update Payment Status)
app.post("/payment-callback", async (req, res) => {
  try {
    const { merchantTransactionId, code } = req.body;
    
    if (!merchantTransactionId || !code) {
      return res.status(400).json({ success: false, message: "Invalid callback data" });
    }

    const status = code === "PAYMENT_SUCCESS" ? "SUCCESS" : "FAILED";

    await Transaction.updateOne({ transactionId: merchantTransactionId }, { $set: { status } });

    return res.json({ success: true, message: `Payment ${status}` });
  } catch (error) {
    console.error("Callback Error:", error.message);
    return res.status(500).json({ success: false, message: "Callback processing failed" });
  }
});

// 🔹 Server Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
