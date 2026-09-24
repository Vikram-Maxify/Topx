const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload");

const {
  createDeposit,
  cancelDeposit,
  onlinePayCallback,
  getDepositStatusByIdentifier,
  getMyDeposits,
  getMyTurnoverHistory,
  getAllDepositsForAdmin,
} = require("../controllers/depositController");

const { protect, adminProtect } = require("../middleware/authMiddleware.js");

// ======================================================
// PUBLIC / WEBHOOK ROUTES
// ======================================================

// QwackPay webhook/callback (no auth — gateway hits this)
router.post("/qwackpay/callback", onlinePayCallback);
router.get("/qwackpay/callback", onlinePayCallback); // some gateways use GET

// ======================================================
// USER ROUTES
// ======================================================

// Create deposit (QwackPay OR manual)
// Note: upload.single("screenshot") — use same field name in controller
// If your controller reads req.files.image, change to upload.single("image")
router.post(
  "/create",
  protect,
  upload.single("screenshot"),
  createDeposit
);

// Cancel a pending deposit
router.post("/cancel/:depositId", protect, cancelDeposit);

// My deposit history (with filters + pagination)
router.get("/my", protect, getMyDeposits);

// Deposit status by Mongo _id OR transactionId
router.get("/status/:identifier", protect, getDepositStatusByIdentifier);

// Referral / turnover history
router.get("/my-turnover", protect, getMyTurnoverHistory);

// ======================================================
// ADMIN ROUTES
// ======================================================

// All deposits (with filters + pagination)
router.get(
  "/admin/all",
  protect,
  adminProtect,
  getAllDepositsForAdmin
);

module.exports = router;