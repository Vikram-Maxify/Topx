import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { api } from "./api";

// ==========================
// Create Deposit
// Route: POST /deposit/create
// Body: multipart/form-data (screenshot field: "screenshot")
// ==========================
export const createDeposit = createAsyncThunk(
  "deposit/create",
  async (formData, thunkAPI) => {
    try {
      const { data } = await api.post("/deposit/create", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return data; // { success, message, paymentUrl, orderId, depositId, deposit }
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Something went wrong"
      );
    }
  }
);

// ==========================
// Cancel Deposit
// Route: POST /deposit/cancel/:depositId
// ==========================
export const cancelDeposit = createAsyncThunk(
  "deposit/cancel",
  async ({ depositId, reason = "User cancelled at gateway" }, thunkAPI) => {
    try {
      const { data } = await api.post(`/deposit/cancel/${depositId}`, {
        reason,
      });
      return data; // { success, message, depositId, orderId, status }
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Something went wrong"
      );
    }
  }
);

// ==========================
// Get Deposit Status by identifier (Mongo _id OR transactionId)
// Route: GET /deposit/status/:identifier
// ==========================
export const getDepositStatus = createAsyncThunk(
  "deposit/status",
  async (identifier, thunkAPI) => {
    try {
      const { data } = await api.get(`/deposit/status/${identifier}`);
      return data.deposit; // { _id, orderId, amount, currency, status, ... }
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Something went wrong"
      );
    }
  }
);

// ==========================
// Get My Deposits (history with filters + pagination)
// Route: GET /deposit/my
// ==========================
export const getMyDeposits = createAsyncThunk(
  "deposit/history",
  async (params = {}, thunkAPI) => {
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
      } = params;

      const query = new URLSearchParams();

      if (status) query.append("status", status);
      if (methodType) query.append("methodType", methodType);
      if (methodTitle) query.append("methodTitle", methodTitle);
      if (transactionId) query.append("transactionId", transactionId);
      if (country) query.append("country", country);
      if (currency) query.append("currency", currency);
      if (fromDate) query.append("fromDate", fromDate);
      if (toDate) query.append("toDate", toDate);
      if (minAmount) query.append("minAmount", minAmount);
      if (maxAmount) query.append("maxAmount", maxAmount);
      query.append("page", page);
      query.append("limit", limit);
      query.append("sort", sort);

      const { data } = await api.get(`/deposit/my?${query.toString()}`);
      // Controller returns: { success, total, currentPage, totalPages, limit, deposits }
      return data;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Something went wrong"
      );
    }
  }
);

// ==========================
// Get My Turnover History (referral)
// Route: GET /deposit/my-turnover
// ==========================
export const getMyTurnoverHistory = createAsyncThunk(
  "deposit/turnoverHistory",
  async (_, thunkAPI) => {
    try {
      const { data } = await api.get("/deposit/my-turnover");
      // Controller returns: { success, downlineCount, stats, commissions }
      return data;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Something went wrong"
      );
    }
  }
);

const initialState = {
  // Deposit history
  deposits: [],
  total: 0,
  currentPage: 1,
  totalPages: 1,
  limit: 10,

  // Single deposit status
  currentDeposit: null,

  // Turnover / referral
  turnover: {
    downlineCount: 0,
    stats: {
      totalCommission: 0,
      weeklyCommission: 0,
      monthlyCommission: 0,
      totalTurnover: 0,
      weeklyTurnover: 0,
      monthlyTurnover: 0,
    },
    commissions: [],
  },

  // UI state
  loading: false,
  success: false,
  message: "",
  error: null,

  // Create deposit specific
  paymentUrl: "",
  orderId: null,
  depositId: null,
};

const depositSlice = createSlice({
  name: "deposit",
  initialState,

  reducers: {
    clearDepositState: (state) => {
      state.loading = false;
      state.success = false;
      state.error = null;
      state.message = "";
      state.paymentUrl = "";
      state.orderId = null;
      state.depositId = null;
    },

    clearCurrentDeposit: (state) => {
      state.currentDeposit = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // ==================
      // Create Deposit
      // ==================
      .addCase(createDeposit.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
        state.message = "";
      })
      .addCase(createDeposit.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.message = action.payload.message || "Deposit created";
        state.paymentUrl = action.payload.paymentUrl || "";
        state.orderId = action.payload.orderId || null;
        state.depositId = action.payload.depositId || null;

        // Agar deposit object aaya ho to history mein push kar do
        if (action.payload.deposit) {
          state.deposits = [action.payload.deposit, ...state.deposits];
        }
      })
      .addCase(createDeposit.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload;
      })

      // ==================
      // Cancel Deposit
      // ==================
      .addCase(cancelDeposit.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelDeposit.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.message = action.payload.message || "Deposit cancelled";

        // Update deposit in history list
        const updatedId = action.payload.depositId;
        if (updatedId) {
          const idx = state.deposits.findIndex(
            (d) => String(d._id) === String(updatedId)
          );
          if (idx !== -1) {
            state.deposits[idx].status = action.payload.status || "rejected";
          }
        }

        // Update currentDeposit if matching
        if (
          state.currentDeposit &&
          String(state.currentDeposit._id) === String(updatedId)
        ) {
          state.currentDeposit.status = action.payload.status || "rejected";
        }
      })
      .addCase(cancelDeposit.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // ==================
      // Get Deposit Status
      // ==================
      .addCase(getDepositStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getDepositStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.currentDeposit = action.payload;

        // Sync into history list if exists
        const idx = state.deposits.findIndex(
          (d) => String(d._id) === String(action.payload._id)
        );
        if (idx !== -1) {
          state.deposits[idx] = { ...state.deposits[idx], ...action.payload };
        }
      })
      .addCase(getDepositStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // ==================
      // Get My Deposits
      // ==================
      .addCase(getMyDeposits.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getMyDeposits.fulfilled, (state, action) => {
        state.loading = false;
        state.deposits = action.payload.deposits || [];
        state.total = action.payload.total || 0;
        state.currentPage = action.payload.currentPage || 1;
        state.totalPages = action.payload.totalPages || 1;
        state.limit = action.payload.limit || 10;
      })
      .addCase(getMyDeposits.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // ==================
      // Get My Turnover History
      // ==================
      .addCase(getMyTurnoverHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getMyTurnoverHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.turnover = {
          downlineCount: action.payload.downlineCount || 0,
          stats: action.payload.stats || initialState.turnover.stats,
          commissions: action.payload.commissions || [],
        };
      })
      .addCase(getMyTurnoverHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearDepositState, clearCurrentDeposit } =
  depositSlice.actions;

export default depositSlice.reducer;