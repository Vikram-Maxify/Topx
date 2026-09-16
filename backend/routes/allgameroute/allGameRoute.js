const express = require("express");
const { launchGame, transferBalance, getgamedetails, gameHistory } = require("../../controllers/allgamecontroller/allGameController");
const protect = require("../../middlewares/authMiddleware");


const router = express.Router();

router.post("/game/get/game", protect, launchGame);
router.get("/game/balance/transfer", protect, transferBalance);
router.post("/game/get/all-game", protect, getgamedetails);
router.post("/game/history", protect, gameHistory);

// Export the router
module.exports = router;
