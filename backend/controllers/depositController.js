const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");

const Deposit = require("../models/Deposit.js");
const User = require("../models/authmodel.js");
const Transaction = require("../models/Transaction"); // renamed from TransactionHistory

// =====================================================
// STATUS CONSTANTS (string based, matching new schema)
// =====================================================
const STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// =====================================================
// QWACKPAY CONFIG
// =====================================================
const QWACKPAY_BASE_URL =
  process.env.QWACKPAY_BASE_URL || "https://qwackpay.com/api/v1";

const QWACKPAY_MERCHANT_ID =
  process.env.QWACKPAY_MERCHANT_ID || "636055076";

const QWACKPAY_API_KEY =
  process.env.QWACKPAY_API_KEY || "DASHBOARD_SE_COPY_KARO";

// =====================================================
// HELPER: QWACKPAY SIGN
// =====================================================
const generateQwackPaySign = (params, apiKey) => {
  const clean = { ...params };
  delete clean.sign;

  const filtered = {};
  Object.keys(clean).forEach((key) => {
    const val = clean[key];
    if (val !== null && val !== undefined && val !== "") {
      filtered[key] = val;
    }
  });

  const sortedKeys = Object.keys(filtered).sort();
  const queryString = sortedKeys
    .map((key) => `${key}=${filtered[key]}`)
    .join("&");

  const signString = `${queryString}&key=${apiKey}`;

  return crypto
    .createHash("md5")
    .update(signString)
    .digest("hex")
    .toUpperCase();
};

const getQwackPayHeaders = () => ({
  "Content-Type": "application/json",
  "X-API-Key": QWACKPAY_API_KEY,
});

const getFrontendUrl = () => {
  return (
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
};

const getQwackPayReturnUrl = () => {
  return (
    process.env.QWACKPAY_RETURN_URL ||
    `${getFrontendUrl()}/payment-success`
  ).replace(/\/$/, "");
};

// =====================================================
// HELPER: Resolve authenticated user
// =====================================================
const resolveAuthUser = async (req) => {
  const id =
    req.user?.id || req.user?._id || req.user?.userId;

  if (!id) return null;

  // id could be a Mongo ObjectId or numeric userId
  let user = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    user = await User.findById(id);
  }
  if (!user && !isNaN(Number(id))) {
    user = await User.findOne({ userId: Number(id) });
  }
  return user;
};

// =====================================================
// CREATE DEPOSIT
// =====================================================
const createDeposit = async (req, res) => {
  try {
    const {
      paymentMethod,
      channel,
      amount,
      utr,
      country,
      currency,
      methodType,
      methodTitle,
      transactionId,
    } = req.body;

    // ---------- AMOUNT VALIDATION ----------
    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    // ---------- USER ----------
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // ---------- NORMALIZE CHANNEL ----------
    const normalizedChannel = String(channel || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, "");

    // =====================================================
    // QWACKPAY FLOW
    // =====================================================
    if (normalizedChannel === "qwackpay") {
      const finalMethodType = "INR";
      const finalMethodTitle = "QwackPay";
      const money = numericAmount;
      const orderId = `DEP${Date.now()}`;

      // ---------- CREATE PENDING DEPOSIT ----------
      const deposit = await Deposit.create({
        user: user._id,
        country: (country || "IN").toUpperCase(),
        currency: currency || "INR",
        methodType: finalMethodType,
        methodTitle: finalMethodTitle,
        amount: money,
        transactionId: orderId,
        status: STATUS.PENDING,
        remark: "QwackPay recharge initiated",
      });

      // ---------- CUSTOMER EMAIL ----------
      const customerEmail =
        String(user.email || "").trim() ||
        `customer${String(user._id)}@setthelife.com`;

      // ---------- QWACKPAY ORDER ----------
      const orderPayload = {
        merchant_id: QWACKPAY_MERCHANT_ID,
        amount: Math.round(numericAmount),
        order_id: orderId,
        customer_phone: String(user.mobile || "").trim(),
        customer_email: customerEmail,
        return_url: getQwackPayReturnUrl(),
      };

      orderPayload.sign = generateQwackPaySign(
        orderPayload,
        QWACKPAY_API_KEY
      );

      try {
        const { data: gatewayResponse } = await axios.post(
          `${QWACKPAY_BASE_URL}/order/create`,
          orderPayload,
          { headers: getQwackPayHeaders(), timeout: 30000 }
        );

        console.log("QWACKPAY CREATE RESPONSE:", gatewayResponse);

        const paymentUrl =
          gatewayResponse?.data?.payment_url ||
          gatewayResponse?.data?.paymentUrl ||
          gatewayResponse?.payment_url ||
          gatewayResponse?.paymentUrl ||
          "";

        const returnedOrderId =
          gatewayResponse?.data?.merchant_order_id ||
          gatewayResponse?.data?.order_id ||
          gatewayResponse?.merchant_order_id ||
          gatewayResponse?.order_id ||
          orderId;

        const qwackOrderId =
          gatewayResponse?.data?.qwack_order_id ||
          gatewayResponse?.qwack_order_id ||
          "";

        if (Number(gatewayResponse?.code) === 200 && paymentUrl) {
          deposit.transactionId = String(qwackOrderId || returnedOrderId);
          deposit.remark = `QwackPay order ${returnedOrderId}`;
          // status remains PENDING
          await deposit.save();

          // ---------- TRANSACTION HISTORY ----------
          await Transaction.create({
            user: user._id,
            amount: money,
            currency: currency || "INR",
            usdAmount: money,
            type: "CREDIT",
            category: "DEPOSIT",
            description: "Pending QwackPay recharge",
            reference: deposit._id,
            referenceModel: "Deposit",
            status: "pending",
          });

          return res.status(201).json({
            success: true,
            message: "QwackPay recharge order created successfully.",
            paymentUrl: String(paymentUrl),
            successUrl: getQwackPayReturnUrl(),
            orderId: returnedOrderId,
            depositId: deposit._id,
            amount: money,
            status: "pending",
            deposit,
            gatewayResponse,
          });
        }

        // ---------- GATEWAY FAILED ----------
        deposit.status = STATUS.REJECTED;
        deposit.remark =
          gatewayResponse?.error ||
          gatewayResponse?.message ||
          gatewayResponse?.data?.message ||
          "QwackPay payment URL not received";
        await deposit.save();

        return res.status(400).json({
          success: false,
          message: deposit.remark,
          paymentUrl: "",
          orderId: deposit.transactionId,
          gatewayResponse,
        });
      } catch (gatewayErr) {
        console.error(
          "QWACKPAY CREATE ERROR:",
          gatewayErr.response?.data || gatewayErr.message
        );

        deposit.status = STATUS.REJECTED;
        deposit.remark = "QwackPay payment request failed.";
        await deposit.save();

        return res.status(502).json({
          success: false,
          message: "QwackPay payment request failed.",
          paymentUrl: "",
          orderId: deposit.transactionId,
          error: gatewayErr.response?.data || gatewayErr.message,
        });
      }
    }

    // =====================================================
    // MANUAL FLOW
    // =====================================================
    if (!paymentMethod || !channel) {
      return res.status(400).json({
        success: false,
        message: "paymentMethod and channel are required",
      });
    }

    const finalMethodType = paymentMethod;
    const finalMethodTitle = methodTitle || channel;
    const orderId = `DEP${Date.now()}`;

    let imageUrl = "";
    if (req.files && req.files.image && req.files.image[0]) {
      imageUrl = req.files.image[0].path;
    }

    const deposit = await Deposit.create({
      user: user._id,
      country: (country || "IN").toUpperCase(),
      currency: currency || "INR",
      methodType: finalMethodType,
      methodTitle: finalMethodTitle,
      amount: numericAmount,
      transactionId: transactionId || utr || orderId,
      status: STATUS.PENDING,
      remark: `Recharge request via ${channel}${
        imageUrl ? ` | proof: ${imageUrl}` : ""
      }`,
    });

    await Transaction.create({
      user: user._id,
      amount: numericAmount,
      currency: currency || "INR",
      usdAmount: numericAmount,
      type: "CREDIT",
      category: "DEPOSIT",
      description: `Recharge request submitted via ${channel}`,
      reference: deposit._id,
      referenceModel: "Deposit",
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Recharge request submitted successfully.",
      paymentUrl: "",
      orderId,
      depositId: deposit._id,
      deposit,
    });
  } catch (error) {
    console.error("CREATE DEPOSIT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// =====================================================
// CANCEL DEPOSIT
// =====================================================
const cancelDeposit = async (req, res) => {
  try {
    const user = await resolveAuthUser(req);
    const { depositId } = req.params;
    const { reason = "User cancelled at gateway" } = req.body || {};

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const query = mongoose.Types.ObjectId.isValid(depositId)
      ? { _id: depositId, user: user._id }
      : { transactionId: String(depositId), user: user._id };

    const deposit = await Deposit.findOne(query);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit not found",
      });
    }

    if (deposit.status === STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        message: "Deposit already approved, cannot cancel",
        status: deposit.status,
      });
    }

    if (deposit.status === STATUS.REJECTED) {
      return res.status(200).json({
        success: true,
        message: "Deposit already cancelled/rejected",
        depositId: deposit._id,
        orderId: deposit.transactionId,
        status: deposit.status,
      });
    }

    deposit.status = STATUS.REJECTED;
    deposit.remark = String(reason);
    deposit.rejectedAt = new Date();
    await deposit.save();

    try {
      await Transaction.findOneAndUpdate(
        {
          reference: deposit._id,
          user: user._id,
          category: "DEPOSIT",
          status: "pending",
        },
        {
          $set: {
            status: "failed",
            description: `User cancelled payment. Reason: ${reason}`,
          },
        },
        { new: true, sort: { createdAt: -1 } }
      );
    } catch (thErr) {
      console.warn("Transaction update failed:", thErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Deposit cancelled",
      depositId: deposit._id,
      orderId: deposit.transactionId,
      status: deposit.status,
      cancelledAt: deposit.rejectedAt,
    });
  } catch (error) {
    console.error("CANCEL DEPOSIT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// =====================================================
// GET DEPOSIT STATUS
// =====================================================
const getDepositStatusByIdentifier = async (req, res) => {
  try {
    const { identifier } = req.params;
    const user = await resolveAuthUser(req);

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Deposit identifier is required",
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const query = mongoose.Types.ObjectId.isValid(identifier)
      ? { _id: identifier, user: user._id }
      : { transactionId: String(identifier), user: user._id };

    const deposit = await Deposit.findOne(query).lean();

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit not found",
      });
    }

    return res.status(200).json({
      success: true,
      deposit: {
        _id: deposit._id,
        orderId: deposit.transactionId,
        amount: deposit.amount,
        currency: deposit.currency,
        status: deposit.status,
        methodType: deposit.methodType,
        methodTitle: deposit.methodTitle,
        remark: deposit.remark || "",
        rejectedAt: deposit.rejectedAt || null,
        approvedAt: deposit.approvedAt || null,
        createdAt: deposit.createdAt,
      },
    });
  } catch (error) {
    console.error("GET DEPOSIT STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// =====================================================
// QWACKPAY WEBHOOK
// =====================================================
const onlinePayCallback = async (req, res) => {
  console.log("=================================================");
  console.log("QWACKPAY WEBHOOK RECEIVED:");
  console.log(req.body);
  console.log("=================================================");

  try {
    const {
      merchant_order_id,
      qwack_order_id,
      amount,
      status,
      utr,
      sign,
    } = req.body;

    if (!merchant_order_id) {
      console.error("QWACKPAY WEBHOOK: ORDER ID MISSING");
      return res.status(400).send("order id missing");
    }

    // ---------- VERIFY SIGN ----------
    const webhookPayload = {
      merchant_order_id,
      qwack_order_id,
      amount,
      status,
      utr,
    };

    const expectedSign = generateQwackPaySign(
      webhookPayload,
      QWACKPAY_API_KEY
    );

    if (
      String(expectedSign).toUpperCase() !==
      String(sign || "").toUpperCase()
    ) {
      console.error("QWACKPAY WEBHOOK SIGN MISMATCH");
      console.error("Expected:", expectedSign);
      console.error("Received:", sign);
      return res.status(400).send("invalid sign");
    }

    // ---------- FIND DEPOSIT ----------
    const deposit = await Deposit.findOne({
      transactionId: String(qwack_order_id || merchant_order_id),
    });

    // Fallback: try by object id of transaction
    let foundDeposit = deposit;
    if (!foundDeposit) {
      foundDeposit = await Deposit.findOne({
        transactionId: String(merchant_order_id),
      });
    }

    if (!foundDeposit) {
      console.warn(`Deposit not found: ${merchant_order_id}`);
      return res.send("success");
    }

    // ---------- ALREADY FINAL ----------
    if (foundDeposit.status === STATUS.APPROVED) {
      console.log(`Webhook already processed: ${merchant_order_id}`);
      return res.send("success");
    }
    if (foundDeposit.status === STATUS.REJECTED) {
      console.log(
        `Ignoring webhook for cancelled/rejected deposit: ${merchant_order_id}`
      );
      return res.send("success");
    }

    // ---------- NORMALIZE STATUS ----------
    const webhookStatus = String(status || "").trim().toLowerCase();
    const isSuccess =
      webhookStatus === "success" ||
      webhookStatus === "1" ||
      webhookStatus === "paid";

    // ---------- FAILED PAYMENT ----------
    if (!isSuccess) {
      console.log(
        `QwackPay payment failed: ${merchant_order_id}, status=${status}`
      );

      foundDeposit.status = STATUS.REJECTED;
      foundDeposit.remark = `QwackPay recharge failed. Status: ${status}${
        utr ? ` UTR: ${utr}` : ""
      }`;
      foundDeposit.rejectedAt = new Date();
      await foundDeposit.save();

      await Transaction.findOneAndUpdate(
        {
          reference: foundDeposit._id,
          user: foundDeposit.user,
          category: "DEPOSIT",
          status: "pending",
        },
        {
          $set: {
            status: "failed",
            description: `QwackPay recharge failed. Status: ${status}`,
          },
        },
        { new: true, sort: { createdAt: -1 } }
      );

      return res.send("success");
    }

    // =================================================
    // SUCCESS PAYMENT
    // =================================================
    console.log(`QWACKPAY PAYMENT SUCCESS: ${merchant_order_id}`);

    const user = await User.findById(foundDeposit.user);
    if (!user) {
      console.error(`User not found for deposit: ${merchant_order_id}`);
      return res.send("success");
    }

    // ---------- ATOMIC CLAIM ----------
    const claimed = await Deposit.findOneAndUpdate(
      {
        _id: foundDeposit._id,
        status: { $ne: STATUS.APPROVED },
      },
      {
        $set: {
          status: STATUS.APPROVED,
          remark: `QwackPay success. UTR: ${utr || "N/A"}`,
          approvedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!claimed) {
      console.log(`Webhook already claimed: ${merchant_order_id}`);
      return res.send("success");
    }

    const creditAmount =
      Number(amount) || Number(foundDeposit.amount) || 0;

    // ---------- WALLET CREDIT ----------
    // New User schema has no `wallet` field.
    // Adjust these fields to match your actual balance fields.
    if (creditAmount > 0) {
      await User.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            credit: creditAmount,     // primary balance field
            total_money: creditAmount,
            recharge: creditAmount,
          },
        },
        { new: true }
      );

      console.log(
        `WALLET CREDITED: ₹${creditAmount} to user ${user._id} (${user.mobile})`
      );
    }

    // ---------- UPDATE TRANSACTION ----------
    const successRemark = `Wallet recharge successful via QwackPay. UTR: ${
      utr || "N/A"
    }. ₹${creditAmount} credited.`;

    const transactionUpdate = await Transaction.findOneAndUpdate(
      {
        reference: foundDeposit._id,
        user: user._id,
        category: "DEPOSIT",
        status: "pending",
      },
      {
        $set: {
          status: "completed",
          amount: creditAmount,
          usdAmount: creditAmount,
          description: successRemark,
        },
      },
      { new: true, sort: { createdAt: -1 } }
    );

    // Fallback: create a new completed transaction
    if (!transactionUpdate) {
      await Transaction.create({
        user: user._id,
        amount: creditAmount,
        currency: foundDeposit.currency || "INR",
        usdAmount: creditAmount,
        type: "CREDIT",
        category: "DEPOSIT",
        description: successRemark,
        reference: foundDeposit._id,
        referenceModel: "Deposit",
        status: "completed",
        creditAfter: (user.credit || 0) + creditAmount,
      });
    }

    console.log("=================================================");
    console.log("PAYMENT SUCCESS COMPLETED");
    console.log(`Order ID: ${merchant_order_id}`);
    console.log(`Amount: ₹${creditAmount}`);
    console.log("=================================================");

    return res.send("success");
  } catch (error) {
    console.error("=================================================");
    console.error("QWACKPAY WEBHOOK ERROR:");
    console.error(error);
    console.error("=================================================");
    return res.send("success");
  }
};

// =====================================================
// CHECK QWACKPAY ORDER STATUS
// =====================================================
const checkQwackPayOrderStatus = async (orderId) => {
  try {
    const payload = {
      merchant_id: QWACKPAY_MERCHANT_ID,
      order_id: orderId,
    };

    payload.sign = generateQwackPaySign(payload, QWACKPAY_API_KEY);

    const { data } = await axios.post(
      `${QWACKPAY_BASE_URL}/order/query`,
      payload,
      { headers: getQwackPayHeaders(), timeout: 30000 }
    );

    console.log("QWACKPAY QUERY RESPONSE:", data);
    return data;
  } catch (error) {
    console.error(
      "QwackPay Query Error:",
      error.response?.data || error.message
    );
    return null;
  }
};

// =====================================================
// GET MY DEPOSITS
// =====================================================
const getMyDeposits = async (req, res) => {
  try {
    const {
      status,
      methodType,
      methodTitle,
      transactionId,
      country,
      currency,
      fromDate,
      toDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 10,
      sort = "desc",
    } = req.query;

    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const query = { user: user._id };

    if (status !== undefined && status !== "") {
      query.status = String(status).toLowerCase();
    }

    if (methodType && methodType.trim()) {
      query.methodType = { $regex: methodType.trim(), $options: "i" };
    }

    if (methodTitle && methodTitle.trim()) {
      query.methodTitle = { $regex: methodTitle.trim(), $options: "i" };
    }

    if (transactionId && transactionId.trim()) {
      query.transactionId = { $regex: transactionId.trim(), $options: "i" };
    }

    if (country && country.trim()) {
      query.country = { $regex: country.trim(), $options: "i" };
    }

    if (currency && currency.trim()) {
      query.currency = { $regex: currency.trim(), $options: "i" };
    }

    // ---------- AMOUNT FILTER ----------
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};

      if (minAmount !== undefined && minAmount !== "") {
        const min = Number(minAmount);
        if (Number.isFinite(min)) query.amount.$gte = min;
      }

      if (maxAmount !== undefined && maxAmount !== "") {
        const max = Number(maxAmount);
        if (Number.isFinite(max)) query.amount.$lte = max;
      }

      if (Object.keys(query.amount).length === 0) delete query.amount;
    }

    // ---------- DATE FILTER ----------
    if (fromDate || toDate) {
      query.createdAt = {};

      if (fromDate) {
        const startDate = new Date(fromDate);
        if (!isNaN(startDate.getTime())) query.createdAt.$gte = startDate;
      }

      if (toDate) {
        const endDate = new Date(toDate);
        if (!isNaN(endDate.getTime())) {
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // ---------- PAGINATION ----------
    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 10, 1), 100);

    const total = await Deposit.countDocuments(query);

    const sortDirection = String(sort).toLowerCase() === "asc" ? 1 : -1;

    const deposits = await Deposit.find(query)
      .sort({ createdAt: sortDirection })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean();

    return res.status(200).json({
      success: true,
      total,
      currentPage,
      totalPages: Math.ceil(total / perPage),
      limit: perPage,
      deposits,
    });
  } catch (error) {
    console.error("GET MY DEPOSITS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// =====================================================
// GET MY TURNOVER HISTORY (referral based)
// =====================================================
const getMyTurnoverHistory = async (req, res) => {
  try {
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // New User schema uses `referralCode` / `referredBy`
    const downlineCount = await User.countDocuments({
      referredBy: user.referralCode,
    });

    const commissions = await Transaction.find({
      user: user._id,
      category: "REFERRAL_BONUS",
      status: "completed",
    }).sort({ createdAt: -1 });

    const formattedCommissions = commissions.map((c) => {
      const match = c.description
        ? c.description.match(/from deposit of (.+)/)
        : null;

      const referredUsername = match ? match[1] : "Referred User";

      const rechargeAmount = Number(
        (Number(c.amount || 0) * 10).toFixed(2)
      );

      return {
        id: c._id,
        amount: c.amount,
        rechargeAmount,
        referredUsername,
        date: c.createdAt
          ? new Date(c.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "-",
        createdAt: c.createdAt,
      };
    });

    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(now.getDate() - 30);

    let weeklyCommission = 0;
    let monthlyCommission = 0;
    let totalCommission = 0;

    formattedCommissions.forEach((c) => {
      const amount = Number(c.amount || 0);
      totalCommission += amount;

      const cDate = new Date(c.createdAt);
      if (cDate >= oneWeekAgo) weeklyCommission += amount;
      if (cDate >= oneMonthAgo) monthlyCommission += amount;
    });

    totalCommission = Number(totalCommission.toFixed(2));
    weeklyCommission = Number(weeklyCommission.toFixed(2));
    monthlyCommission = Number(monthlyCommission.toFixed(2));

    const totalTurnover = Number((totalCommission * 10).toFixed(2));
    const weeklyTurnover = Number((weeklyCommission * 10).toFixed(2));
    const monthlyTurnover = Number((monthlyCommission * 10).toFixed(2));

    return res.status(200).json({
      success: true,
      downlineCount,
      stats: {
        totalCommission,
        weeklyCommission,
        monthlyCommission,
        totalTurnover,
        weeklyTurnover,
        monthlyTurnover,
      },
      commissions: formattedCommissions,
    });
  } catch (error) {
    console.error("GET TURNOVER HISTORY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// =====================================================
// ADMIN: GET ALL DEPOSITS
// =====================================================
const getAllDepositsForAdmin = async (req, res) => {
  try {
    const {
      status,
      methodType,
      methodTitle,
      transactionId,
      country,
      currency,
      userId,
      fromDate,
      toDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 20,
      sort = "desc",
    } = req.query;

    const query = {};

    if (status !== undefined && status !== "") {
      query.status = String(status).toLowerCase();
    }

    if (methodType && methodType.trim()) {
      query.methodType = { $regex: methodType.trim(), $options: "i" };
    }

    if (methodTitle && methodTitle.trim()) {
      query.methodTitle = { $regex: methodTitle.trim(), $options: "i" };
    }

    if (transactionId && transactionId.trim()) {
      query.transactionId = { $regex: transactionId.trim(), $options: "i" };
    }

    if (country && country.trim()) {
      query.country = { $regex: country.trim(), $options: "i" };
    }

    if (currency && currency.trim()) {
      query.currency = { $regex: currency.trim(), $options: "i" };
    }

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.user = userId;
    }

    // ---------- AMOUNT FILTER ----------
    if (minAmount !== undefined || maxAmount !== undefined) {
      query.amount = {};

      if (minAmount !== undefined && minAmount !== "") {
        const min = Number(minAmount);
        if (Number.isFinite(min)) query.amount.$gte = min;
      }

      if (maxAmount !== undefined && maxAmount !== "") {
        const max = Number(maxAmount);
        if (Number.isFinite(max)) query.amount.$lte = max;
      }

      if (Object.keys(query.amount).length === 0) delete query.amount;
    }

    // ---------- DATE FILTER ----------
    if (fromDate || toDate) {
      query.createdAt = {};

      if (fromDate) {
        const startDate = new Date(fromDate);
        if (!isNaN(startDate.getTime())) {
          startDate.setHours(0, 0, 0, 0);
          query.createdAt.$gte = startDate;
        }
      }

      if (toDate) {
        const endDate = new Date(toDate);
        if (!isNaN(endDate.getTime())) {
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }

    // ---------- PAGINATION ----------
    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (currentPage - 1) * perPage;

    const sortDirection = String(sort).toLowerCase() === "asc" ? 1 : -1;

    const total = await Deposit.countDocuments(query);

    const deposits = await Deposit.find(query)
      .populate("user", "name email mobile userId referralCode")
      .sort({ createdAt: sortDirection })
      .skip(skip)
      .limit(perPage)
      .lean();

    return res.status(200).json({
      success: true,
      message: "All deposits fetched successfully",
      total,
      currentPage,
      perPage,
      totalPages: Math.ceil(total / perPage),
      deposits,
    });
  } catch (error) {
    console.error("GET ALL DEPOSITS FOR ADMIN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createDeposit,
  cancelDeposit,
  onlinePayCallback,
  getDepositStatusByIdentifier,
  getMyDeposits,
  getMyTurnoverHistory,
  getAllDepositsForAdmin,
  checkQwackPayOrderStatus,
  generateQwackPaySign,
  STATUS,
};