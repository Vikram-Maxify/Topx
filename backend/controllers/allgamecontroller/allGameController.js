const axios = require("axios");
const AuthModel = require("../../models/authmodel");

/**
 * =====================================================
 * GAME PROVIDER CONFIGURATION
 * =====================================================
 *
 * Your Node/Express backend can run locally.
 * The GAME PROVIDER is hosted on api-doc.space.
 *
 * Architecture:
 *
 * React
 *   ↓
 * Local Node Backend
 *   ↓
 * https://www.api-doc.space/api
 *   ↓
 * Game Provider
 *
 * =====================================================
 */

const apiUrl = "https://www.api-doc.space/api";

const launchUrl = "https://www.api-doc.space/api/launch-game";

const key = "k0B2cXsGPZwzaxALE2IJ";

/**
 * Common headers required by provider
 */
const requestConfig = {
  headers: {
    "Content-Type": "application/json",
    "x-domain": "matchadda.vip",
  },
};

/* =====================================================
   CHECK BALANCE
   ===================================================== */

const checkBalance = async (req, res) => {
  try {
    const playerid = String(req.body?.playerid || "").trim();

    if (!playerid) {
      return res.status(400).json({
        status: false,
        message: "playerid required",
      });
    }

    const response = await axios.post(
      `${apiUrl}/Userbalance`,
      {
        playerid,
        key,
      },
      requestConfig,
    );

    console.log("CHECK BALANCE RESPONSE 👉", response.data);

    return res.status(200).json({
      status: true,
      message: "Balance fetched successfully",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "CHECK BALANCE ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Balance error",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   TRANSFER BALANCE
   GAME PROVIDER → LOCAL WALLET
   ===================================================== */

const transferBalance = async (req, res) => {
  try {
    /* -----------------------------------------
       1. FIND USER
    ----------------------------------------- */

    const user = await AuthModel.findById(req.user._id);

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Invalid user",
      });
    }

    const playerid = String(user.mobile || "").trim();

    if (!playerid) {
      return res.status(400).json({
        status: false,
        message: "User mobile/playerid not found",
      });
    }

    /* -----------------------------------------
       2. GET PROVIDER BALANCE
    ----------------------------------------- */

    const balanceResponse = await axios.post(
      `${apiUrl}/Userbalance`,
      {
        playerid,
        key,
      },
      requestConfig,
    );

    console.log("PROVIDER BALANCE RESPONSE 👉", balanceResponse.data);

    const providerBalance = Number(balanceResponse.data?.Balance || 0);

    console.log("PROVIDER BALANCE 👉", providerBalance);

    /* -----------------------------------------
       3. NO BALANCE
    ----------------------------------------- */

    if (Number.isNaN(providerBalance) || providerBalance <= 0) {
      return res.status(200).json({
        status: false,
        message: "No balance to transfer",
        balance: providerBalance,
      });
    }

    /* -----------------------------------------
       4. SAVE OLD LOCAL BALANCE
    ----------------------------------------- */

    const oldCredit = Number(user.credit || 0);

    /* -----------------------------------------
       5. ADD PROVIDER BALANCE TO LOCAL WALLET
    ----------------------------------------- */

    const updatedUser = await AuthModel.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          credit: providerBalance,
        },
      },
      {
        new: true,
      },
    );

    if (!updatedUser) {
      return res.status(500).json({
        status: false,
        message: "Failed to update local wallet",
      });
    }

    /* -----------------------------------------
       6. RESET PROVIDER BALANCE
    ----------------------------------------- */

    let resetResponse;

    try {
      resetResponse = await axios.post(
        `${apiUrl}/Setbalance`,
        {
          playerid,
          key,
          opening_balance: -providerBalance,
        },
        requestConfig,
      );
    } catch (resetError) {
      console.error(
        "PROVIDER RESET ERROR 👉",
        resetError.response?.data || resetError.message,
      );

      /* -----------------------------------------
         ROLLBACK LOCAL WALLET
      ----------------------------------------- */

      await AuthModel.updateOne(
        {
          _id: user._id,
        },
        {
          $set: {
            credit: oldCredit,
          },
        },
      );

      return res.status(resetError.response?.status || 500).json({
        status: false,
        message: "Provider balance reset failed, rollback applied",
        error: resetError.response?.data || resetError.message,
      });
    }

    console.log("PROVIDER RESET RESPONSE 👉", resetResponse.data);

    /* -----------------------------------------
       7. CHECK RESET STATUS
    ----------------------------------------- */

    if (resetResponse.data?.status !== true) {
      await AuthModel.updateOne(
        {
          _id: user._id,
        },
        {
          $set: {
            credit: oldCredit,
          },
        },
      );

      return res.status(500).json({
        status: false,
        message: "Provider reset failed, rollback applied",
        providerResponse: resetResponse.data,
      });
    }

    /* -----------------------------------------
       8. SUCCESS
    ----------------------------------------- */

    return res.status(200).json({
      status: true,
      message: "Balance transferred successfully",
      transferredAmount: providerBalance,
      currentBalance: updatedUser.credit,
    });
  } catch (error) {
    console.error(
      "TRANSFER BALANCE ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Transfer error",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   LAUNCH GAME
   LOCAL WALLET → GAME PROVIDER
   ===================================================== */

const launchGame = async (req, res) => {
  try {
    /* -----------------------------------------
       1. GET GAME ID
    ----------------------------------------- */

    const { gameId } = req.body || {};

    if (!gameId) {
      return res.status(400).json({
        status: false,
        message: "gameId required",
      });
    }

    /* -----------------------------------------
       2. FIND USER
    ----------------------------------------- */

    const user = await AuthModel.findById(req.user._id);

    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Invalid user",
      });
    }

    const playerid = String(user.mobile || "").trim();

    if (!playerid) {
      return res.status(400).json({
        status: false,
        message: "User mobile/playerid not found",
      });
    }

    /* -----------------------------------------
       3. GET WALLET VALUES
    ----------------------------------------- */

    const credit = Number(user.credit || 0);

    const exposure = Number(user.exposure || 0);

    const openingBalance = credit - exposure;

    console.log("LAUNCH GAME REQUEST 👉", {
      playerid,
      gameId,
      credit,
      exposure,
      openingBalance,
    });

    /* -----------------------------------------
       4. LAUNCH GAME
    ----------------------------------------- */

    const response = await axios.post(
      launchUrl,
      {
        playerid,
        uid: gameId,
        opening_balance: openingBalance,
        key,
      },
      requestConfig,
    );

    console.log("LAUNCH GAME RESPONSE 👉", response.data);

    /* -----------------------------------------
       5. CHECK SUCCESS
    ----------------------------------------- */

    if (response.data?.status === true) {
      /**
       * Game provider successfully received
       * the balance and launched the game.
       *
       * Existing behavior:
       * local credit becomes 0.
       */

      await AuthModel.updateOne(
        {
          _id: user._id,
        },
        {
          $set: {
            credit: 0,
          },
        },
      );

      return res.status(200).json({
        status: true,
        message: "Game launched successfully",
        data: response.data,
      });
    }

    /* -----------------------------------------
       6. PROVIDER RETURNED FAILURE
    ----------------------------------------- */

    return res.status(500).json({
      status: false,
      message: "Game launch failed",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "LAUNCH GAME ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Launch error",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GET GAME DETAILS
   ===================================================== */

const getgamedetails = async (req, res) => {
  try {
    const { page = 1, size = 2000 } = req.query;

    const response = await axios.get(
      `${apiUrl}/getgamedetails?page=${page}&size=${size}`,
      requestConfig,
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "GET GAME DETAILS ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch game list",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GAME PROVIDER
   ===================================================== */

const gameProvider = async (req, res) => {
  try {
    const response = await axios.get(
      `${apiUrl}/getgamedetails?provider_list=1`,
      requestConfig,
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "GAME PROVIDER ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch game providers",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GAME TYPE
   ===================================================== */

const gameType = async (req, res) => {
  try {
    const response = await axios.get(
      `${apiUrl}/getgamedetails?gametype_list=1`,
      requestConfig,
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("GAME TYPE ERROR 👉", error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch game types",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GAME LIST BY PROVIDER
   ===================================================== */

const gameListByProvider = async (req, res) => {
  try {
    const { provider, page = 1, size = 20 } = req.query;

    if (!provider) {
      return res.status(400).json({
        status: false,
        message: "provider required",
      });
    }

    const response = await axios.get(
      `${apiUrl}/getgamedetails?provider=${encodeURIComponent(
        provider,
      )}&page=${page}&size=${size}`,
      requestConfig,
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "GAME LIST PROVIDER ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch games by provider",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GAME LIST BY GAME TYPE
   ===================================================== */

const gameListByGameType = async (req, res) => {
  try {
    const { game_type, page = 1, size = 20 } = req.query;

    if (!game_type) {
      return res.status(400).json({
        status: false,
        message: "game_type required",
      });
    }

    const response = await axios.get(
      `${apiUrl}/getgamedetails?game_type=${encodeURIComponent(
        game_type,
      )}&page=${page}&size=${size}`,
      requestConfig,
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "GAME LIST GAME TYPE ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch games by game type",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GAME LIST BY GAME TYPE + PROVIDER
   ===================================================== */

const gameListByGameTypeAndProvider = async (req, res) => {
  try {
    const { provider, game_type, page = 1, size = 20 } = req.query;

    if (!provider || !game_type) {
      return res.status(400).json({
        status: false,
        message: "provider and game_type required",
      });
    }

    const response = await axios.get(
      `${apiUrl}/getgamedetails?provider=${encodeURIComponent(
        provider,
      )}&game_type=${encodeURIComponent(game_type)}&page=${page}&size=${size}`,
      requestConfig,
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "GAME LIST TYPE PROVIDER ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch games",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   GAME HISTORY
   ===================================================== */

const gameHistory = async (req, res) => {
  try {
    const playerid = String(req.user?.mobile || "").trim();

    if (!playerid) {
      return res.status(400).json({
        status: false,
        message: "Player ID not found",
      });
    }

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
      requestConfig,
    );

    return res.status(200).json({
      data: response.data,
      message: "Game history fetched successfully",
      status: true,
    });
  } catch (error) {
    console.error(
      "GAME HISTORY ERROR 👉",
      error.response?.data || error.message,
    );

    return res.status(error.response?.status || 500).json({
      status: false,
      message: "Failed to fetch game history",
      error: error.response?.data || error.message,
    });
  }
};

/* =====================================================
   EXPORTS
   ===================================================== */

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
