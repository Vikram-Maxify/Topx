const express = require("express");

const {
  createDeposit,
  cancelDeposit,
  getMyDeposits,
  onlinePayCallback,
  getMyTurnoverHistory,
  getAllDepositsForAdmin,
  getDepositStatusByIdentifier,
  generateTestQwackPaySign,
} = require("../controllers/depositController.js");

const uploadDeposit = require("../middleware/depositUpload.js");

const { protect, adminProtect } = require("../middleware/authMiddleware.js");



const router = express.Router();

// =====================================================
// CREATE DEPOSIT (RECHARGE)
// USER
// =====================================================

router.post(
  "/deposit",
  protect,
  uploadDeposit.fields([
    {
      name: "image",
      maxCount: 1,
    },
  ]),
  createDeposit
);

// =====================================================
// CANCEL DEPOSIT
// USER
// =====================================================

router.post(
  "/deposit/:depositId/cancel",
  protect,
  cancelDeposit
);

// =====================================================
// TURNOVER HISTORY
// USER
// =====================================================

router.get(
  "/deposit/turnover",
  protect,
  getMyTurnoverHistory
);

// =====================================================
// DEPOSIT STATUS BY IDENTIFIER
// PUBLIC
//
// _id OR orderId
// Used by payment-success page
// =====================================================

router.get(
  "/deposit/status/:identifier",
  protect,
  getDepositStatusByIdentifier
);

// =====================================================
// MY DEPOSIT HISTORY
// USER
// =====================================================

router.get(
  "/deposit",
  protect,
  getMyDeposits
);

// =====================================================
// ADMIN: GET ALL DEPOSITS
// ADMIN ONLY
// =====================================================

router.get(
  "/deposits",
  protect,
  adminProtect,
  getAllDepositsForAdmin
);


// =====================================================
// AUTOMATIC PAYMENT CALLBACK
// PUBLIC / PAYMENT GATEWAY
//
// QWACKPAY WEBHOOK
// =====================================================

router.all(
  "/deposit/callback",
  onlinePayCallback
);

module.exports = router;