require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { encode } = require("js-base64");
const sha256 = require("js-sha256");

const app = express();
app.use(express.json());
app.use(cors());

const MERCHANT_ID = process.env.MERCHANT_ID;
const MERCHANT_KEY = process.env.MERCHANT_KEY;
const SALT_KEY = process.env.SALT_KEY;
const SALT_INDEX = process.env.SALT_INDEX;
const PHONEPE_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";

const generateTransactionId = () => `T${Date.now()}${Math.floor(Math.random() * 1000000)}`;

app.post("/initiate-payment", async (req, res) => {
  try {
    const { mobile, amount } = req.body;
    if (!mobile || !amount) {
      return res.status(400).json({ success: false, message: "Mobile number and amount are required" });
    }

    const transactionId = generateTransactionId();

    const requestBody = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: transactionId,
      merchantUserId: `user-${mobile}`, // Use mobile as unique user ID
      amount: Math.round(amount * 100), // Convert to paise
      mobileNumber: mobile,
      callbackUrl: "https://www.phonepe.com/callback",
      paymentInstrument: { type: "PAY_PAGE" },
    };
    

    const apiEndpoint = "/pg/v1/pay";
    const payload = encode(JSON.stringify(requestBody));
    const checksum = sha256(payload + apiEndpoint + SALT_KEY) + "###" + SALT_INDEX;
    

    const response = await axios.post(PHONEPE_BASE_URL, 
      { request: payload }, 
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": MERCHANT_ID, 
        },
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error("Payment error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Payment processing failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
