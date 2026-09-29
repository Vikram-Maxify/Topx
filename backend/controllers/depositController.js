// controllers/depositController.js
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");

const Deposit = require("../models/Deposit.js");
const User = require("../models/authmodel.js");
const TransactionHistory = require("../models/Transaction.js");
const QwackPayCallbackLog = require("../models/QwackPayCallbackLog");

// =====================================================
// STATUS CONSTANTS (match the models)
// =====================================================
// Deposit.status:      "pending" | "approved" | "rejected"
// Transaction.status:  "pending" | "completed" | "failed"
//
// The Deposit enum has no "cancelled" value, so a cancelled deposit is stored
// as "rejected" with a remark starting with "Cancelled" (see isCancelled()).
// =====================================================

const STATUS = {
  PENDING: "pending",
  SUCCESS: "approved",
  FAILED: "rejected",
  CANCELLED: "rejected",
};

const TX_STATUS = {
  PENDING: "pending",
  SUCCESS: "completed",
  FAILED: "failed",
};

// Accepts new string statuses and the old numeric ones (0/1/2/3)
const STATUS_FILTER_MAP = {
  0: "pending",
  1: "approved",
  2: "rejected",
  3: "rejected",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  success: "approved",
  failed: "rejected",
  cancelled: "rejected",
  canceled: "rejected",
};

const normalizeStatusFilter = (value) => {
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(STATUS_FILTER_MAP, key)
    ? STATUS_FILTER_MAP[key]
    : null;
};

const isCancelled = (deposit) =>
  deposit?.status === STATUS.CANCELLED &&
  /^cancelled/i.test(String(deposit?.remark || ""));

// =====================================================
// QWACKPAY CONFIG
// =====================================================

const QWACKPAY_BASE_URL = (
  process.env.QWACKPAY_BASE_URL || "https://qwackpay.com/api/v1"
).replace(/\/+$/, "");

const QWACKPAY_MERCHANT_ID = process.env.QWACKPAY_MERCHANT_ID || "636055076";

const QWACKPAY_API_KEY = process.env.QWACKPAY_API_KEY || "";

const getFrontendUrl = () =>
  (
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");

const getBackendUrl = () =>
  (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

const getQwackPayReturnUrl = () =>
  (
    process.env.QWACKPAY_RETURN_URL || `${getFrontendUrl()}/payment-success`
  ).replace(/\/+$/, "");

const getQwackPayCallbackUrl = () =>
  (
    process.env.QWACKPAY_CALLBACK_URL ||
    `${getBackendUrl()}/api/deposit/callback`
  ).replace(/\/+$/, "");

// =====================================================
// HELPERS
// =====================================================

const generateQwackPaySign = (params, apiKey) => {
  const clean = { ...(params || {}) };
  delete clean.sign;

  const filtered = {};
  Object.keys(clean).forEach((key) => {
    const value = clean[key];
    if (value !== null && value !== undefined && value !== "") {
      filtered[key] = value;
    }
  });

  const queryString = Object.keys(filtered)
    .sort()
    .map((key) => `${key}=${filtered[key]}`)
    .join("&");

  return crypto
    .createHash("md5")
    .update(`${queryString}&key=${apiKey}`)
    .digest("hex")
    .toUpperCase();
};

const getQwackPayHeaders = () => ({
  "Content-Type": "application/json",
  "X-API-Key": QWACKPAY_API_KEY,
});

const getUserIdFromRequest = (req) =>
  req.user?.id || req.user?._id || req.user?.uuid || null;

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generateOrderId = () =>
  `DEP${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Adds legacy field names so existing frontend code keeps working.
const serializeDeposit = (deposit) => {
  const d =
    deposit && typeof deposit.toObject === "function"
      ? deposit.toObject()
      : deposit;

  return {
    ...d,
    orderId: d.transactionId,
    paymentMethod: d.methodType,
    channel: d.methodTitle,
    cancelled: isCancelled(d),
  };
};

const pickValue = (sources, keys) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const v = source[key];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return undefined;
};

// =====================================================
// CREATE DEPOSIT
// =====================================================

const createDeposit = async (req, res) => {
  try {
    const { paymentMethod, channel, amount, utr } = req.body || {};

    if (amount === undefined || amount === null || amount === "") {
      return res
        .status(400)
        .json({ success: false, message: "Amount is required" });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User authentication required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const country = String(req.body?.country || user.country || "IN")
      .trim()
      .toUpperCase();

    const normalizedChannel = String(channel || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, "");

    // =====================================================
    // QWACKPAY FLOW
    // =====================================================

    if (normalizedChannel === "qwackpay") {
      const money = numericAmount;
      const orderId = generateOrderId();

      // Deposit.transactionId holds our merchant order id
      const deposit = await Deposit.create({
        user: user._id,
        country,
        currency: "INR",
        methodType: "GATEWAY",
        methodTitle: "QwackPay",
        amount: money,
        transactionId: orderId,
        screenshot: "",
        status: STATUS.PENDING,
        remark: "QwackPay order initiated",
      });

      const existingEmail = String(user.email || "").trim();
      const customerEmail =
        existingEmail || `customer${String(user._id)}@setthelife.com`;

      const orderPayload = {
        merchant_id: QWACKPAY_MERCHANT_ID,
        amount: Math.round(numericAmount),
        order_id: orderId,
        customer_phone: String(user.mobile || "").trim(),
        customer_email: customerEmail,
        return_url: getQwackPayReturnUrl(),
        callback_url: getQwackPayCallbackUrl(),
      };

      orderPayload.sign = generateQwackPaySign(orderPayload, QWACKPAY_API_KEY);

      console.log("QWACKPAY CREATE REQUEST", {
        merchant_id: QWACKPAY_MERCHANT_ID,
        amount: orderPayload.amount,
        order_id: orderPayload.order_id,
        customer_phone: orderPayload.customer_phone,
        customer_email: orderPayload.customer_email,
        return_url: orderPayload.return_url,
        callback_url: orderPayload.callback_url,
      });

      try {
        const response = await axios.post(
          `${QWACKPAY_BASE_URL}/order/create`,
          orderPayload,
          { headers: getQwackPayHeaders(), timeout: 30000 }
        );

        const gatewayResponse = response.data;

        console.log(
          "QWACKPAY CREATE RESPONSE:",
          JSON.stringify(gatewayResponse, null, 2)
        );

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
          gatewayResponse?.data?.qwackOrderId ||
          gatewayResponse?.qwack_order_id ||
          gatewayResponse?.qwackOrderId ||
          "";

        const gatewayCode = Number(
          gatewayResponse?.code ??
            gatewayResponse?.status_code ??
            gatewayResponse?.statusCode ??
            0
        );

        if (paymentUrl) {
          deposit.transactionId = String(returnedOrderId);
          deposit.status = STATUS.PENDING;
          deposit.remark = `QwackPay order created${
            qwackOrderId ? ` | qwackOrderId=${qwackOrderId}` : ""
          }`;
          await deposit.save();

          await TransactionHistory.create({
            user: user._id,
            amount: money,
            currency: "INR",
            type: "CREDIT",
            category: "DEPOSIT",
            description: "Pending QwackPay recharge",
            reference: deposit._id,
            referenceModel: "Deposit",
            status: TX_STATUS.PENDING,
          });

          return res.status(201).json({
            success: true,
            message: "QwackPay recharge order created successfully.",
            paymentUrl: String(paymentUrl),
            successUrl: getQwackPayReturnUrl(),
            callbackUrl: getQwackPayCallbackUrl(),
            orderId: deposit.transactionId,
            depositId: deposit._id,
            amount: money,
            status: "pending",
            deposit: serializeDeposit(deposit),
            gatewayResponse,
          });
        }

        deposit.status = STATUS.FAILED;
        deposit.rejectedAt = new Date();
        deposit.remark = "QwackPay payment URL not received";
        await deposit.save();

        return res.status(400).json({
          success: false,
          message:
            gatewayResponse?.error ||
            gatewayResponse?.message ||
            gatewayResponse?.data?.message ||
            `QwackPay payment URL not received. Gateway code: ${gatewayCode}`,
          paymentUrl: "",
          orderId: deposit.transactionId,
          gatewayResponse,
        });
      } catch (gatewayErr) {
        console.error(
          "QWACKPAY CREATE ERROR:",
          gatewayErr.response?.data || gatewayErr.message
        );

        deposit.status = STATUS.FAILED;
        deposit.rejectedAt = new Date();
        deposit.remark = "QwackPay payment request failed";
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

    const usdRet = 92;
    const isInr = String(paymentMethod).toUpperCase() === "INR";
    const money = isInr ? numericAmount : numericAmount * usdRet;

    const orderId = generateOrderId();
    const cleanUtr = String(utr || "").trim();

    let imageUrl = "";
    if (req.files && req.files.image && req.files.image[0]) {
      imageUrl = req.files.image[0].path || "";
    }

    // transactionId is required by the model: use the user's UTR when given
    const deposit = await Deposit.create({
      user: user._id,
      country,
      currency: "INR",
      methodType: String(paymentMethod),
      methodTitle: String(channel),
      amount: money,
      transactionId: cleanUtr || orderId,
      screenshot: imageUrl,
      status: STATUS.PENDING,
      remark: "",
    });

    await TransactionHistory.create({
      user: user._id,
      amount: money,
      currency: "INR",
      usdAmount: isInr ? undefined : numericAmount,
      exchangeRate: isInr ? undefined : usdRet,
      type: "CREDIT",
      category: "DEPOSIT",
      description: `Recharge request submitted via ${channel}`,
      reference: deposit._id,
      referenceModel: "Deposit",
      status: TX_STATUS.PENDING,
    });

    return res.status(201).json({
      success: true,
      message: "Recharge request submitted successfully.",
      paymentUrl: "",
      orderId: deposit.transactionId,
      depositId: deposit._id,
      deposit: serializeDeposit(deposit),
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
    const userId = getUserIdFromRequest(req);
    const { depositId } = req.params;
    const { reason = "User cancelled at gateway" } = req.body || {};

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    if (!depositId) {
      return res
        .status(400)
        .json({ success: false, message: "Deposit ID is required" });
    }

    const query = mongoose.Types.ObjectId.isValid(depositId)
      ? { _id: depositId, user: userId }
      : { transactionId: String(depositId), user: userId };

    const deposit = await Deposit.findOne(query);

    if (!deposit) {
      return res
        .status(404)
        .json({ success: false, message: "Deposit not found" });
    }

    if (deposit.status === STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: "Deposit already successful, cannot cancel",
        status: deposit.status,
      });
    }

    // Already rejected (cancelled or failed): nothing left to cancel
    if (deposit.status === STATUS.CANCELLED) {
      return res.status(200).json({
        success: true,
        message: isCancelled(deposit)
          ? "Deposit already cancelled"
          : "Deposit already closed",
        depositId: deposit._id,
        orderId: deposit.transactionId,
        status: deposit.status,
        cancelledAt: deposit.rejectedAt,
      });
    }

    deposit.status = STATUS.CANCELLED;
    deposit.rejectedAt = new Date();
    deposit.remark = `Cancelled by user. Reason: ${reason}`;
    await deposit.save();

    try {
      await TransactionHistory.updateOne(
        {
          reference: deposit._id,
          category: "DEPOSIT",
          status: TX_STATUS.PENDING,
        },
        {
          $set: {
            status: TX_STATUS.FAILED,
            description: `User cancelled payment. Reason: ${reason}`,
          },
        }
      );
    } catch (historyError) {
      console.warn("Transaction update failed:", historyError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Deposit cancelled",
      depositId: deposit._id,
      orderId: deposit.transactionId,
      status: deposit.status,
      cancelled: true,
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
    const userId = getUserIdFromRequest(req);

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Deposit identifier is required",
      });
    }

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const query = mongoose.Types.ObjectId.isValid(identifier)
      ? { _id: identifier, user: userId }
      : { transactionId: String(identifier), user: userId };

    const deposit = await Deposit.findOne(query).lean();

    if (!deposit) {
      return res
        .status(404)
        .json({ success: false, message: "Deposit not found" });
    }

    return res.status(200).json({
      success: true,
      deposit: {
        _id: deposit._id,
        orderId: deposit.transactionId,
        transactionId: deposit.transactionId,
        amount: deposit.amount,
        currency: deposit.currency,
        status: deposit.status,
        cancelled: isCancelled(deposit),
        methodType: deposit.methodType,
        methodTitle: deposit.methodTitle,
        paymentMethod: deposit.methodType,
        channel: deposit.methodTitle,
        remark: deposit.remark || "",
        approvedAt: deposit.approvedAt || null,
        rejectedAt: deposit.rejectedAt || null,
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
// CALLBACK HELPERS
// =====================================================

const getCallbackValue = (body = {}, query = {}, keys = []) => {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return body[key];
    }
    if (query[key] !== undefined && query[key] !== null && query[key] !== "") {
      return query[key];
    }
  }
  return "";
};

const sanitizeCallbackHeaders = (headers = {}) => {
  const safeHeaders = {};

  Object.entries(headers || {}).forEach(([key, value]) => {
    const lowerKey = String(key).toLowerCase();

    if (
      lowerKey === "authorization" ||
      lowerKey === "cookie" ||
      lowerKey === "set-cookie" ||
      lowerKey === "x-api-key"
    ) {
      safeHeaders[key] = "***MASKED***";
      return;
    }

    safeHeaders[key] = value;
  });

  return safeHeaders;
};

const getCallbackIp = (req) => {
  const forwarded = req.headers?.["x-forwarded-for"];

  return (
    req.headers?.["cf-connecting-ip"] ||
    (forwarded ? String(forwarded).split(",")[0].trim() : "") ||
    req.headers?.["x-real-ip"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    ""
  );
};

const KEYS = {
  status: [
    "status",
    "payment_status",
    "paymentStatus",
    "transaction_status",
    "transactionStatus",
    "order_status",
    "orderStatus",
  ],
  amount: ["amount", "paid_amount", "paidAmount", "total_amount", "totalAmount"],
  merchantOrderId: [
    "merchant_order_id",
    "merchantOrderId",
    "merchant_order",
    "merchantOrder",
    "order_id",
    "orderId",
  ],
  qwackOrderId: [
    "qwack_order_id",
    "qwackOrderId",
    "transaction_id",
    "transactionId",
    "payment_id",
    "paymentId",
  ],
  utr: [
    "utr",
    "utr_number",
    "utrNumber",
    "rrn",
    "reference",
    "reference_number",
  ],
  sign: ["sign", "signature"],
};

const SUCCESS_STATUSES = [
  "success",
  "successful",
  "paid",
  "completed",
  "complete",
  "approved",
  "1",
];

const FAILED_STATUSES = [
  "failed",
  "failure",
  "declined",
  "rejected",
  "cancelled",
  "canceled",
  "2",
  "3",
];

const PENDING_STATUSES = [
  "",
  "pending",
  "processing",
  "initiated",
  "created",
  "unpaid",
  "0",
];

const normalizeGatewayResult = (response) => {
  const root = response && typeof response === "object" ? response : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const result =
    root.result && typeof root.result === "object" ? root.result : {};
  const sources = [data, result, root];

  const status = String(pickValue(sources, KEYS.status) ?? "")
    .trim()
    .toLowerCase();

  return {
    status,
    amount: Number(pickValue(sources, KEYS.amount)),
    merchantOrderId: String(
      pickValue(sources, KEYS.merchantOrderId) ?? ""
    ).trim(),
    qwackOrderId: String(pickValue(sources, KEYS.qwackOrderId) ?? "").trim(),
    utr: String(pickValue(sources, KEYS.utr) ?? "").trim(),
    raw: root,
    isSuccess: SUCCESS_STATUSES.includes(status),
    isFailed: FAILED_STATUSES.includes(status),
    isPending: PENDING_STATUSES.includes(status),
  };
};

// =====================================================
// QWACKPAY WEBHOOK / CALLBACK
// =====================================================

const onlinePayCallback = async (req, res) => {
  let callbackLog = null;

  const setCallbackLog = async (values) => {
    if (!callbackLog?._id) return;
    try {
      await QwackPayCallbackLog.findByIdAndUpdate(callbackLog._id, {
        $set: values,
      });
    } catch (logError) {
      console.error("QWACKPAY CALLBACK LOG UPDATE ERROR:", logError.message);
    }
  };

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const query = req.query && typeof req.query === "object" ? req.query : {};

    console.log("QWACKPAY CALLBACK RECEIVED");
    console.log("METHOD:", req.method);
    console.log("URL:", req.originalUrl || req.url || "");
    console.log("IP:", getCallbackIp(req));
    console.log("BODY:", JSON.stringify(body, null, 2));
    console.log("QUERY:", JSON.stringify(query, null, 2));

    const merchantOrderId = String(
      getCallbackValue(body, query, KEYS.merchantOrderId) || ""
    ).trim();

    const qwackOrderId = String(
      getCallbackValue(body, query, KEYS.qwackOrderId) || ""
    ).trim();

    const amountRaw = getCallbackValue(body, query, KEYS.amount);

    const gatewayStatus = String(
      getCallbackValue(body, query, KEYS.status) || ""
    ).trim();

    const utr = String(getCallbackValue(body, query, KEYS.utr) || "").trim();

    const receivedSign = String(
      getCallbackValue(body, query, KEYS.sign) || ""
    ).trim();

    const callbackAmount = Number(amountRaw);

    callbackLog = await QwackPayCallbackLog.create({
      merchantOrderId,
      qwackOrderId,
      amount: Number.isFinite(callbackAmount) ? callbackAmount : 0,
      gatewayStatus,
      utr,
      sign: receivedSign,
      signValid: false,
      method: req.method || "",
      url: req.originalUrl || req.url || "",
      ip: getCallbackIp(req),
      headers: sanitizeCallbackHeaders(req.headers),
      body,
      query,
      event: "RECEIVED",
      processingStatus: "RECEIVED",
      message: "QwackPay callback received",
    });

    console.log("QWACKPAY CALLBACK LOG SAVED:", callbackLog._id.toString());

    if (req.method === "GET" && !merchantOrderId && !qwackOrderId) {
      await setCallbackLog({
        event: "INVALID",
        processingStatus: "SUCCESS",
        message: "Callback endpoint health check",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    if (!merchantOrderId && !qwackOrderId) {
      await setCallbackLog({
        event: "INVALID",
        processingStatus: "SUCCESS",
        message: "Callback received without order ID; no wallet action taken",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    // ---------------------------------------------------
    // FIND LOCAL DEPOSIT
    // (transactionId = our merchant order id; the QwackPay order id, when
    //  known, is stored in remark as "qwackOrderId=...")
    // ---------------------------------------------------

    let deposit = null;

    if (merchantOrderId) {
      deposit = await Deposit.findOne({ transactionId: merchantOrderId });
    }

    if (!deposit && qwackOrderId) {
      deposit = await Deposit.findOne({
        $or: [
          { transactionId: qwackOrderId },
          {
            remark: {
              $regex: escapeRegex(`qwackOrderId=${qwackOrderId}`),
            },
          },
        ],
      });
    }

    if (!deposit) {
      await setCallbackLog({
        event: "DEPOSIT_NOT_FOUND",
        processingStatus: "FAILED",
        message: `Deposit not found for merchantOrderId=${merchantOrderId}, qwackOrderId=${qwackOrderId}`,
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    await setCallbackLog({ depositId: deposit._id });

    if (deposit.status === STATUS.SUCCESS) {
      await setCallbackLog({
        event: "ALREADY_PROCESSED",
        processingStatus: "SUCCESS",
        message: "Payment already processed",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    if (deposit.status === STATUS.CANCELLED) {
      await setCallbackLog({
        event: isCancelled(deposit) ? "CANCELLED_DEPOSIT" : "REJECTED_DEPOSIT",
        processingStatus: "SUCCESS",
        message: isCancelled(deposit)
          ? "Deposit was already cancelled"
          : "Deposit was already rejected/failed",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    // ---------------------------------------------------
    // SIGNATURE CHECK
    // ---------------------------------------------------

    const webhookPayload = {
      merchant_order_id: merchantOrderId,
      qwack_order_id: qwackOrderId,
      amount: amountRaw,
      status: gatewayStatus,
      utr,
    };

    const expectedSign = generateQwackPaySign(webhookPayload, QWACKPAY_API_KEY);

    const signValid =
      Boolean(receivedSign) &&
      expectedSign.toUpperCase() === receivedSign.toUpperCase();

    await setCallbackLog({
      signValid,
      event: signValid ? "SIGN_VALID" : "SIGN_INVALID",
    });

    console.log("QWACKPAY SIGN CHECK:", {
      expectedSign,
      receivedSign: receivedSign.toUpperCase(),
      signValid,
    });

    // ---------------------------------------------------
    // VERIFY GATEWAY STATUS
    // ---------------------------------------------------

    let verified = signValid;
    let gatewayResult = null;

    const callbackStatusLower = gatewayStatus.toLowerCase();
    const callbackLooksSuccess = SUCCESS_STATUSES.includes(callbackStatusLower);

    const mustQueryGateway =
      !signValid ||
      !callbackLooksSuccess ||
      !Number.isFinite(callbackAmount) ||
      callbackAmount <= 0;

    if (mustQueryGateway) {
      try {
        const queryOrderId = merchantOrderId || deposit.transactionId;
        const queryResponse = await checkQwackPayOrderStatus(queryOrderId);
        gatewayResult = normalizeGatewayResult(queryResponse);

        console.log("QWACKPAY VERIFIED QUERY:", {
          orderId: queryOrderId,
          status: gatewayResult.status,
          amount: gatewayResult.amount,
          merchantOrderId: gatewayResult.merchantOrderId,
          qwackOrderId: gatewayResult.qwackOrderId,
          utr: gatewayResult.utr,
        });

        if (gatewayResult.isSuccess) {
          verified = true;
        }
      } catch (queryError) {
        console.error(
          "QWACKPAY ORDER QUERY ERROR:",
          queryError.response?.data || queryError.message
        );
      }
    }

    // ---------------------------------------------------
    // USE VERIFIED GATEWAY DATA WHEN AVAILABLE
    // ---------------------------------------------------

    const finalStatus = gatewayResult?.isSuccess
      ? "success"
      : gatewayResult?.isFailed
      ? "failed"
      : callbackStatusLower;

    const finalAmount =
      gatewayResult &&
      Number.isFinite(gatewayResult.amount) &&
      gatewayResult.amount > 0
        ? gatewayResult.amount
        : callbackAmount;

    const finalUtr = gatewayResult?.utr || utr || "";

    const finalQwackOrderId = gatewayResult?.qwackOrderId || qwackOrderId || "";

    const refsRemark = (prefix) =>
      `${prefix}${
        finalQwackOrderId ? ` | qwackOrderId=${finalQwackOrderId}` : ""
      }${finalUtr ? ` | utr=${finalUtr}` : ""}`;

    // ---------------------------------------------------
    // DO NOT FAIL PENDING/UNKNOWN PAYMENTS
    // ---------------------------------------------------

    if (!verified && !signValid) {
      await setCallbackLog({
        event: "VERIFICATION_PENDING",
        processingStatus: "SUCCESS",
        message:
          gatewayResult?.isPending || !gatewayResult?.status
            ? "Callback received; gateway payment is not yet verified"
            : "Callback signature invalid and gateway query did not verify success",
        error: receivedSign
          ? `Expected ${expectedSign}, received ${receivedSign.toUpperCase()}`
          : "Callback signature missing",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    // ---------------------------------------------------
    // EXPLICIT VERIFIED FAILURE
    // ---------------------------------------------------

    if (finalStatus === "failed" && (signValid || gatewayResult?.isFailed)) {
      const shownStatus = gatewayResult?.status || gatewayStatus;

      await Deposit.findOneAndUpdate(
        { _id: deposit._id, status: STATUS.PENDING },
        {
          $set: {
            status: STATUS.FAILED,
            rejectedAt: new Date(),
            remark: refsRemark(`QwackPay payment failed. Status: ${shownStatus}`),
          },
        }
      );

      await TransactionHistory.findOneAndUpdate(
        {
          reference: deposit._id,
          category: "DEPOSIT",
          status: TX_STATUS.PENDING,
        },
        {
          $set: {
            status: TX_STATUS.FAILED,
            amount: Number(deposit.amount),
            description: `QwackPay recharge failed. Status: ${shownStatus}`,
          },
        },
        { sort: { createdAt: -1 } }
      );

      await setCallbackLog({
        event: "PAYMENT_FAILED",
        processingStatus: "SUCCESS",
        message: `Verified payment failure: ${shownStatus}`,
        processedAt: new Date(),
      });

      return res.status(200).send("success");
    }

    // ---------------------------------------------------
    // PENDING / UNKNOWN
    // ---------------------------------------------------

    if (finalStatus !== "success") {
      await setCallbackLog({
        event: "PAYMENT_PENDING",
        processingStatus: "SUCCESS",
        message: `Payment is still pending. Callback status=${
          gatewayStatus || "unknown"
        }`,
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    // ---------------------------------------------------
    // SUCCESS VALIDATION
    // ---------------------------------------------------

    if (!verified) {
      await setCallbackLog({
        event: "SUCCESS_NOT_VERIFIED",
        processingStatus: "FAILED",
        message: "Success callback could not be verified",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      await setCallbackLog({
        event: "INVALID_AMOUNT",
        processingStatus: "FAILED",
        message: `Invalid verified amount: ${finalAmount}`,
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    const depositAmount = Number(deposit.amount);

    if (
      Number.isFinite(depositAmount) &&
      Math.abs(finalAmount - depositAmount) > 0.01
    ) {
      await setCallbackLog({
        event: "AMOUNT_MISMATCH",
        processingStatus: "FAILED",
        message: `Amount mismatch. Deposit=${depositAmount}, Gateway=${finalAmount}`,
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    const user = await User.findById(deposit.user);

    if (!user) {
      await setCallbackLog({
        event: "USER_NOT_FOUND",
        processingStatus: "FAILED",
        message: "User not found",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    // ---------------------------------------------------
    // ATOMIC DEPOSIT CLAIM + WALLET CREDIT + TRANSACTION
    // ---------------------------------------------------

    const session = await mongoose.startSession();

    let transactionCommitted = false;
    let updatedWallet = null;

    try {
      await session.withTransaction(async () => {
        // reset in case the transaction body is retried
        transactionCommitted = false;
        updatedWallet = null;

        // Claim first: only one callback can move pending -> approved
        const claimed = await Deposit.findOneAndUpdate(
          { _id: deposit._id, status: STATUS.PENDING },
          {
            $set: {
              status: STATUS.SUCCESS,
              approvedAt: new Date(),
              approvedBy: null,
              remark: refsRemark("Approved via QwackPay"),
            },
          },
          { new: true, session }
        );

        if (!claimed) {
          return;
        }

        const walletUpdate = await User.findOneAndUpdate(
          { _id: deposit.user },
          { $inc: { wallet: finalAmount } },
          { new: true, session }
        );

        if (!walletUpdate) {
          throw new Error("Wallet update returned null");
        }

        const successDescription = `Wallet recharge successful via QwackPay. UTR: ${
          finalUtr || "N/A"
        }. ₹${finalAmount} credited to wallet.`;

        const historyUpdate = await TransactionHistory.findOneAndUpdate(
          {
            reference: deposit._id,
            category: "DEPOSIT",
            status: TX_STATUS.PENDING,
          },
          {
            $set: {
              status: TX_STATUS.SUCCESS,
              amount: finalAmount,
              creditAfter: walletUpdate.wallet,
              description: successDescription,
            },
          },
          { new: true, sort: { createdAt: -1 }, session }
        );

        if (!historyUpdate) {
          await TransactionHistory.create(
            [
              {
                user: deposit.user,
                amount: finalAmount,
                currency: "INR",
                type: "CREDIT",
                category: "DEPOSIT",
                description: successDescription,
                reference: deposit._id,
                referenceModel: "Deposit",
                status: TX_STATUS.SUCCESS,
                creditAfter: walletUpdate.wallet,
              },
            ],
            { session }
          );
        }

        updatedWallet = walletUpdate.wallet;
        transactionCommitted = true;
      });
    } finally {
      await session.endSession();
    }

    if (!transactionCommitted) {
      await setCallbackLog({
        event: "ALREADY_PROCESSED",
        processingStatus: "SUCCESS",
        message: "Payment was already processed by another callback",
        processedAt: new Date(),
      });
      return res.status(200).send("success");
    }

    await setCallbackLog({
      event: "PAYMENT_SUCCESS",
      processingStatus: "SUCCESS",
      signValid: signValid || Boolean(gatewayResult?.isSuccess),
      message: `₹${finalAmount} credited successfully. Wallet=${updatedWallet}`,
      processedAt: new Date(),
    });

    console.log("QWACKPAY CALLBACK SUCCESS", {
      order: merchantOrderId || deposit.transactionId,
      qwackOrder: finalQwackOrderId,
      amount: finalAmount,
      utr: finalUtr,
      user: user._id.toString(),
      newWallet: updatedWallet,
    });

    return res.status(200).send("success");
  } catch (error) {
    console.error(
      "QWACKPAY CALLBACK ERROR:",
      error.response?.data || error.message
    );

    await setCallbackLog({
      event: "EXCEPTION",
      processingStatus: "FAILED",
      message: "Callback processing exception",
      error: error.message,
      processedAt: new Date(),
    });

    return res.status(200).send("success");
  }
};

// =====================================================
// CHECK QWACKPAY ORDER STATUS
// =====================================================

const checkQwackPayOrderStatus = async (orderId) => {
  try {
    if (!orderId) {
      return null;
    }

    const payload = {
      merchant_id: QWACKPAY_MERCHANT_ID,
      order_id: orderId,
    };

    payload.sign = generateQwackPaySign(payload, QWACKPAY_API_KEY);

    const response = await axios.post(
      `${QWACKPAY_BASE_URL}/order/query`,
      payload,
      { headers: getQwackPayHeaders(), timeout: 30000 }
    );

    console.log("QWACKPAY QUERY RESPONSE:", response.data);

    return response.data;
  } catch (error) {
    console.error(
      "QWACKPAY QUERY ERROR:",
      error.response?.data || error.message
    );

    return null;
  }
};

// =====================================================
// SHARED DEPOSIT LIST FILTERS
// =====================================================
// Fields that no longer exist on Deposit (phone, username, uid, utr) are gone.
// Old query params are mapped where possible:
//   paymentMethod -> methodType, channel -> methodTitle,
//   orderId/transactionId -> transactionId, utr -> transactionId or remark

const hasValue = (v) =>
  v !== undefined && v !== null && String(v).trim() !== "";

const buildDepositQuery = (q, base = {}, isAdmin = false) => {
  const query = { ...base };
  const and = [];
  const rx = (v) => ({ $regex: escapeRegex(String(v).trim()), $options: "i" });

  if (hasValue(q.status)) {
    const s = normalizeStatusFilter(q.status);
    if (s) query.status = s;
  }

  if (hasValue(q.paymentMethod)) query.methodType = rx(q.paymentMethod);
  if (hasValue(q.channel)) query.methodTitle = rx(q.channel);
  if (hasValue(q.country)) {
    query.country = String(q.country).trim().toUpperCase();
  }

  if (hasValue(q.orderId)) and.push({ transactionId: rx(q.orderId) });
  if (hasValue(q.transactionId)) {
    and.push({ transactionId: rx(q.transactionId) });
  }
  if (hasValue(q.utr)) {
    and.push({ $or: [{ transactionId: rx(q.utr) }, { remark: rx(q.utr) }] });
  }

  if (isAdmin && hasValue(q.user) && mongoose.Types.ObjectId.isValid(q.user)) {
    query.user = q.user;
  }

  if (and.length) query.$and = and;

  if (hasValue(q.minAmount) || hasValue(q.maxAmount)) {
    const amountQuery = {};

    if (hasValue(q.minAmount)) {
      const min = Number(q.minAmount);
      if (Number.isFinite(min)) amountQuery.$gte = min;
    }

    if (hasValue(q.maxAmount)) {
      const max = Number(q.maxAmount);
      if (Number.isFinite(max)) amountQuery.$lte = max;
    }

    if (Object.keys(amountQuery).length > 0) query.amount = amountQuery;
  }

  if (q.fromDate || q.toDate) {
    const dateQuery = {};

    if (q.fromDate) {
      const startDate = new Date(q.fromDate);
      if (!Number.isNaN(startDate.getTime())) {
        startDate.setHours(0, 0, 0, 0);
        dateQuery.$gte = startDate;
      }
    }

    if (q.toDate) {
      const endDate = new Date(q.toDate);
      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        dateQuery.$lte = endDate;
      }
    }

    if (Object.keys(dateQuery).length > 0) query.createdAt = dateQuery;
  }

  return query;
};

const getPagination = (q, defaultLimit) => {
  const currentPage = Math.max(Number(q.page) || 1, 1);
  const perPage = Math.min(Math.max(Number(q.limit) || defaultLimit, 1), 100);
  const sortDirection = String(q.sort || "desc").toLowerCase() === "asc" ? 1 : -1;

  return {
    currentPage,
    perPage,
    skip: (currentPage - 1) * perPage,
    sortDirection,
  };
};

// =====================================================
// GET MY DEPOSITS
// =====================================================

const getMyDeposits = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const query = buildDepositQuery(req.query, { user: userId });
    const { currentPage, perPage, skip, sortDirection } = getPagination(
      req.query,
      10
    );

    const total = await Deposit.countDocuments(query);

    const deposits = await Deposit.find(query)
      .sort({ createdAt: sortDirection })
      .skip(skip)
      .limit(perPage)
      .lean();

    return res.status(200).json({
      success: true,
      total,
      currentPage,
      totalPages: Math.ceil(total / perPage),
      limit: perPage,
      deposits: deposits.map(serializeDeposit),
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
// GET MY TURNOVER HISTORY
// =====================================================
// Transaction has no "Referral Bonus" type/category, so referral bonuses are
// matched as completed CREDIT rows whose description starts with
// "Referral Bonus" and contains "from deposit of <username>".

const getMyTurnoverHistory = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const downlineCount = await User.countDocuments({
      referral: user.refCode,
    });

    const commissions = await TransactionHistory.find({
      user: userId,
      type: "CREDIT",
      status: TX_STATUS.SUCCESS,
      description: { $regex: /^Referral Bonus/i },
    }).sort({ createdAt: -1 });

    const formattedCommissions = commissions.map((commission) => {
      const match = commission.description
        ? commission.description.match(/from deposit of (.+)/)
        : null;

      const referredUsername = match ? match[1] : "Referred User";

      const rechargeAmount = Number(
        (Number(commission.amount || 0) * 10).toFixed(2)
      );

      return {
        id: commission._id,
        amount: commission.amount,
        rechargeAmount,
        referredUsername,
        date: commission.createdAt
          ? new Date(commission.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "-",
        createdAt: commission.createdAt,
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

    formattedCommissions.forEach((commission) => {
      const amount = Number(commission.amount || 0);
      totalCommission += amount;

      const commissionDate = new Date(commission.createdAt);
      if (commissionDate >= oneWeekAgo) weeklyCommission += amount;
      if (commissionDate >= oneMonthAgo) monthlyCommission += amount;
    });

    totalCommission = Number(totalCommission.toFixed(2));
    weeklyCommission = Number(weeklyCommission.toFixed(2));
    monthlyCommission = Number(monthlyCommission.toFixed(2));

    return res.status(200).json({
      success: true,
      downlineCount,
      stats: {
        totalCommission,
        weeklyCommission,
        monthlyCommission,
        totalTurnover: Number((totalCommission * 10).toFixed(2)),
        weeklyTurnover: Number((weeklyCommission * 10).toFixed(2)),
        monthlyTurnover: Number((monthlyCommission * 10).toFixed(2)),
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
    const query = buildDepositQuery(req.query, {}, true);
    const { currentPage, perPage, skip, sortDirection } = getPagination(
      req.query,
      20
    );

    const total = await Deposit.countDocuments(query);

    const deposits = await Deposit.find(query)
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
      deposits: deposits.map(serializeDeposit),
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

// =====================================================
// EXPORTS
// =====================================================

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