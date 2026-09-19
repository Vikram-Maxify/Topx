const axios = require("axios");
const AuthModel = require("../../models/authmodel");

/**
 * 🔴 LIVE ENVIRONMENT ONLY
 */
// const apiUrl = "http://localhost:8000/api";
const apiUrl = "https://www.api-doc.space/api";

const launchUrl = "https://www.api-doc.space/api/launch-game";
// const launchUrl = "http://localhost:8000/api/launch-game";

const key = "5HXuVkACXHtu04Y7SgBL";
// const key = "3aqSD5NzX8sKj2MG2CkNS6mqerzJywUW";

/* =========================
   CHECK BALANCE
========================= */
const checkBalance = async (req, res) => {
  try {
    const playerid = String(req.body.playerid || "").trim();

    if (!playerid) {
      return res.status(400).json({
        status: false,
        message: "playerid required",
      });
    }

    const response = await axios.post(`${apiUrl}/Userbalance`, {
      playerid,
      key,
    });

    console.log("CHECK BALANCE RESPONSE 👉", response.data);

    return res.json({
      status: true,
      message: "Balance fetched successfully",
      data: response.data,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Balance error",
      error: error.response?.data || error.message,
    });
  }
};

/* =========================
   TRANSFER BALANCE (ZAP → LOCAL)
========================= */
const transferBalance = async (req, res) => {
  try {
    /* 1️⃣ Find user */
    const user = await AuthModel.findById(req.user._id);

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Invalid user",
      });
    }

    const playerid = String(user.mobile).trim();

    /* 2️⃣ Get balance from Zapcore */
    const balRes = await axios.post(
      `${apiUrl}/Userbalance?playerid=${playerid}&key=${key}`,
      {
        playerid,
        key,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-domain": "matchadda.vip",
        },
      },
    );

    const zapBalance = Number(balRes.data?.Balance || 0);

    /* 3️⃣ Check balance */
    if (!isNaN(zapBalance) && zapBalance > 0) {
      /* 4️⃣ Add balance to LOCAL wallet
         ✅ credit removed
         ✅ balance used
      */
      const updatedUser = await AuthModel.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            balance: zapBalance + Number(user.exposure || 0),
          },
        },
        {
          new: true,
        },
      );

      /* 5️⃣ Reset Zapcore balance */
      const resetRes = await axios.post(
        `${apiUrl}/Setbalance?playerid=${playerid}&key=${key}`,
        {
          playerid,
          key,
          opening_balance: -zapBalance,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-domain": "matchadda.vip",
          },
        },
      );

      /* 6️⃣ Rollback if reset fails */
      if (resetRes.data?.status !== true) {
        await AuthModel.updateOne({ _id: user._id }, [
          {
            $set: {
              balance: {
                $cond: [
                  {
                    $gte: ["$balance", zapBalance],
                  },
                  {
                    $subtract: ["$balance", zapBalance],
                  },
                  0,
                ],
              },
            },
          },
        ]);

        return res.status(500).json({
          status: false,
          message: "Zap reset failed, rollback applied safely",
        });
      }

      /* ✅ SUCCESS */
      return res.status(200).json({
        status: true,
        message: "Balance transferred successfully",
        transferredAmount: zapBalance,
        currentBalance: updatedUser.balance,
      });
    } else {
      /* ❌ NO BALANCE */
      return res.status(200).json({
        status: false,
        message: "No balance to transfer",
      });
    }
  } catch (error) {
    console.error("TRANSFER BALANCE ERROR 👉", error);

    return res.status(500).json({
      status: false,
      message: "Transfer error",
      error: error.response?.data || error.message,
    });
  }
};

/* =========================
   LAUNCH GAME (LOCAL → ZAP)
========================= */
const launchGame = async (req, res) => {
  try {
    const { gameId } = req.body;

    if (!gameId) {
      return res.status(400).json({
        status: false,
        message: "gameId required",
      });
    }

    const user = await AuthModel.findById(req.user._id);

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Invalid user",
      });
    }

    const playerid = String(user.mobile).trim();

    /*
     * Local available balance
     *
     * balance = total wallet balance
     * exposure = locked/exposed amount
     *
     * Amount sent to game = balance - exposure
     */
    const openingBalance =
      Number(user.balance || 0) - Number(user.exposure || 0);

    const response = await axios.post(
      launchUrl,
      {
        playerid,
        uid: gameId,
        opening_balance: openingBalance,
        key,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-domain": "matchadda.vip",
        },
      },
    );

    if (response.data?.status === true) {
      /*
       * ✅ credit removed
       * ✅ balance reset
       */
      await AuthModel.updateOne(
        { _id: user._id },
        {
          $set: {
            balance: 0,
          },
        },
      );

      return res.json({
        status: true,
        message: "Game launched successfully",
        data: response.data,
      });
    }

    return res.status(500).json({
      status: false,
      message: "Game launch failed",
      data: response.data,
    });
  } catch (error) {
    console.error("LAUNCH GAME ERROR 👉", error);

    return res.status(500).json({
      status: false,
      message: "Launch error",
      error: error.response?.data || error.message,
    });
  }
};

/* =========================
   GAME META & LISTING
========================= */

const getgamedetails = async (req, res) => {
  try {
    const { page = 1, size = 2000 } = req.query;

    const response = await axios.get(
      `${apiUrl}/getgamedetails?page=${page}&size=${size}`,
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

const gameProvider = async (req, res) => {
  try {
    const response = await axios.get(
      `${apiUrl}/getgamedetails?provider_list=1`,
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

const gameType = async (req, res) => {
  try {
    const response = await axios.get(
      `${apiUrl}/getgamedetails?gametype_list=1`,
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

const gameListByProvider = async (req, res) => {
  try {
    const { provider, page = 1, size = 20 } = req.query;

    const response = await axios.get(
      `${apiUrl}/getgamedetails?provider=${provider}&page=${page}&size=${size}`,
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

const gameListByGameType = async (req, res) => {
  try {
    const { game_type, page = 1, size = 20 } = req.query;

    const response = await axios.get(
      `${apiUrl}/getgamedetails?game_type=${game_type}&page=${page}&size=${size}`,
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

const gameListByGameTypeAndProvider = async (req, res) => {
  try {
    const { provider, game_type, page = 1, size = 20 } = req.query;

    const response = await axios.get(
      `${apiUrl}/getgamedetails?provider=${provider}&game_type=${game_type}&page=${page}&size=${size}`,
    );

    return res.json(response.data);
  } catch (err) {
    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

/* =========================
   GAME HISTORY
========================= */

const gameHistory = async (req, res) => {
  try {
    const playerid = String(req.user.mobile).trim();

    const { page = 1, size = 2000, from_date, to_date } = req.query;

    const response = await axios.post(
      `${apiUrl}/history?page=${page}&size=${size}`,
      {
        key,
        playerid,
        page,
        limit: size,
        from_date,
        to_date,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-domain": "matchadda.vip",
        },
      },
    );

    return res.json({
      data: response.data,
      message: "Game history fetched successfully",
      status: true,
    });
  } catch (err) {
    console.error("GAME HISTORY ERROR 👉", err);

    return res.status(500).json({
      status: false,
      error: err.message,
    });
  }
};

/* =========================
   EXPORTS
========================= */

module.exports = {
  checkBalance,
  transferBalance,
  launchGame,
  getgamedetails,
  gameProvider,
  gameType,
  gameListByProvider,
  gameListByGameType,
  gameListByGameTypeAndProvider,
  gameHistory,
};
