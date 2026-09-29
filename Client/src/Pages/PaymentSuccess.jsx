import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Wallet,
  Home,
  RefreshCw,
} from "lucide-react";

import {
  fetchDepositStatus,
  clearCurrentDeposit,
} from "../redux/slices/depositSlice";

const STATUS = {
  PENDING: 0,
  SUCCESS: 1,
  FAILED: 2,
  CANCELLED: 3,
};

const POLL_INTERVAL = 3000;
const MAX_POLL_ATTEMPTS = 10;

const getOrderIdFromSources = (searchParams) => {
  const urlOrderId =
    searchParams.get("order_id") ||
    searchParams.get("merchant_order_id") ||
    searchParams.get("merchantOrderId") ||
    searchParams.get("orderId");

  if (urlOrderId) return String(urlOrderId).trim();

  try {
    const storedOrderId =
      localStorage.getItem("qwackpay_order_id") ||
      sessionStorage.getItem("deposit_pending_id");

    return storedOrderId ? String(storedOrderId).trim() : "";
  } catch {
    return "";
  }
};

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const {
    currentDeposit = null,
    statusLoading = false,
    error = null,
  } = useSelector((state) => state.deposit || {});

  const [localStatus, setLocalStatus] = useState("loading");
  const [amount, setAmount] = useState(null);
  const [orderId, setOrderId] = useState("");
  const [pollingFinished, setPollingFinished] = useState(false);

  const pollTimerRef = useRef(null);
  const pollCountRef = useRef(0);
  const mountedRef = useRef(false);
  const startedRef = useRef(false);

  const clearPollTimer = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearPollTimer();
    };
  }, []);

  useEffect(() => {
    const id = getOrderIdFromSources(searchParams);

    if (!id) {
      // Never show success without a verifiable order ID.
      setOrderId("");
      setLocalStatus("failed");
      setPollingFinished(true);
      return;
    }

    setOrderId(id);
    setLocalStatus("loading");
    setPollingFinished(false);
    pollCountRef.current = 0;
    startedRef.current = false;

    // Do not remove qwackpay_order_id yet; it is a useful fallback until
    // the backend has confirmed the payment.
    try {
      sessionStorage.removeItem("deposit_pending_id");
      sessionStorage.removeItem("deposit_pending_amount");
    } catch {}

    if (!startedRef.current) {
      startedRef.current = true;
      dispatch(fetchDepositStatus(id));
    }

    return () => clearPollTimer();
  }, [searchParams, dispatch]);

  useEffect(() => {
    if (!currentDeposit) return;

    const backendStatus = Number(currentDeposit.status);

    if (currentDeposit.amount !== undefined && currentDeposit.amount !== null) {
      setAmount(currentDeposit.amount);
    }

    const backendOrderId =
      currentDeposit.orderId ||
      currentDeposit.merchantOrderId ||
      currentDeposit.merchant_order_id ||
      currentDeposit.identifier;

    if (backendOrderId) {
      setOrderId(String(backendOrderId));
    }

    if (backendStatus === STATUS.SUCCESS) {
      clearPollTimer();
      setPollingFinished(true);
      setLocalStatus("success");

      try {
        localStorage.removeItem("qwackpay_order_id");
      } catch {}
      return;
    }

    if (backendStatus === STATUS.FAILED) {
      clearPollTimer();
      setPollingFinished(true);
      setLocalStatus("failed");
      return;
    }

    if (backendStatus === STATUS.CANCELLED) {
      clearPollTimer();
      setPollingFinished(true);
      setLocalStatus("cancelled");
      return;
    }

    // Unknown/0 status is never treated as success.
    setLocalStatus("pending");
  }, [currentDeposit]);

  useEffect(() => {
    if (!orderId || pollingFinished) return;

    if (currentDeposit) {
      const currentStatus = Number(currentDeposit.status);
      if (
        currentStatus === STATUS.SUCCESS ||
        currentStatus === STATUS.FAILED ||
        currentStatus === STATUS.CANCELLED
      ) {
        return;
      }
    }

    clearPollTimer();

    pollTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;

      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        clearPollTimer();
        setPollingFinished(true);
        setLocalStatus("pending");
        return;
      }

      pollCountRef.current += 1;
      dispatch(fetchDepositStatus(orderId));
    }, POLL_INTERVAL);

    return () => clearPollTimer();
  }, [orderId, currentDeposit, pollingFinished, dispatch]);

  useEffect(() => {
    if (error && !currentDeposit) {
      // API error is not a successful payment.
      setLocalStatus("pending");
    }
  }, [error, currentDeposit]);

  const handleRetryStatus = () => {
    if (!orderId) return;

    clearPollTimer();
    pollCountRef.current = 0;
    setPollingFinished(false);
    setLocalStatus("loading");
    dispatch(fetchDepositStatus(orderId));
  };

  const handleGoHome = () => {
    clearPollTimer();
    dispatch(clearCurrentDeposit());
    navigate("/");
  };

  const handleTryAgain = () => {
    clearPollTimer();
    dispatch(clearCurrentDeposit());

    try {
      localStorage.removeItem("qwackpay_order_id");
      sessionStorage.removeItem("deposit_pending_id");
      sessionStorage.removeItem("deposit_pending_amount");
    } catch {}

    navigate("/recharge");
  };

  const formattedAmount =
    amount !== null &&
    amount !== undefined &&
    amount !== "" &&
    !Number.isNaN(Number(amount))
      ? Number(amount).toFixed(2)
      : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050606] px-4 py-8 text-white">
      <div className="w-full max-w-md rounded-[20px] border border-[#292929] bg-[#0b0d0d] p-6 text-center shadow-[0_0_30px_rgba(245,206,84,0.05)]">
        {localStatus === "loading" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#f5ce54]/10">
              <Loader2 size={52} className="animate-spin text-[#f5ce54]" />
            </div>
            <h1 className="mt-5 text-xl font-bold">Checking Payment...</h1>
            <p className="mt-2 text-sm text-white/50">Please wait</p>
            {orderId && (
              <p className="mt-4 break-all text-[11px] text-white/30">
                Order ID: {orderId}
              </p>
            )}
          </>
        )}

        {localStatus === "success" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 size={52} className="text-green-500" />
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-green-500">
              Recharge Successful
            </h1>
            {formattedAmount ? (
              <p className="mt-3 flex items-center justify-center gap-2 text-base text-white/70">
                <Wallet size={18} className="text-[#f5ce54]" />
                <span className="font-bold text-[#f5ce54]">
                  ₹{formattedAmount}
                </span>
                <span>added to wallet</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-white/60">
                Your wallet balance has been updated
              </p>
            )}
            {orderId && (
              <p className="mt-3 break-all text-[11px] text-white/35">
                Order ID: {orderId}
              </p>
            )}
            <div className="mt-4 rounded-lg border border-green-500/10 bg-green-500/5 px-4 py-3">
              <p className="text-xs text-green-400">
                Payment successfully verified by server.
              </p>
            </div>
          </>
        )}

        {localStatus === "pending" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/10">
              <Clock size={48} className="text-yellow-400" />
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-yellow-400">
              Payment Processing
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Your payment is being verified. Once the payment gateway confirms
              it, the balance will be added to your wallet.
            </p>
            {formattedAmount && (
              <p className="mt-3 text-lg font-bold text-[#f5ce54]">
                ₹{formattedAmount}
              </p>
            )}
            {orderId && (
              <p className="mt-3 break-all text-[11px] text-white/35">
                Order ID: {orderId}
              </p>
            )}
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/50">
              {statusLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Auto-checking status...
                </>
              ) : (
                <>
                  <Clock size={14} />
                  Waiting for payment confirmation...
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleRetryStatus}
              disabled={statusLoading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] border border-[#353535] bg-[#121515] px-5 py-3 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={statusLoading ? "animate-spin" : ""} />
              Check Payment Again
            </button>
          </>
        )}

        {localStatus === "failed" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
              <XCircle size={52} className="text-red-500" />
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-red-500">
              Payment Failed
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Your payment could not be completed. Please try again.
            </p>
            {formattedAmount && (
              <p className="mt-3 text-lg font-bold text-white/70">
                ₹{formattedAmount}
              </p>
            )}
            {orderId && (
              <p className="mt-3 break-all text-[11px] text-white/35">
                Order ID: {orderId}
              </p>
            )}
          </>
        )}

        {localStatus === "cancelled" && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/10">
              <XCircle size={52} className="text-yellow-400" />
            </div>
            <h1 className="mt-5 text-2xl font-extrabold text-yellow-400">
              Payment Cancelled
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/60">
              You cancelled the payment. No amount was added to your wallet.
            </p>
            {formattedAmount && (
              <p className="mt-3 text-lg font-bold text-white/70">
                ₹{formattedAmount}
              </p>
            )}
            {orderId && (
              <p className="mt-3 break-all text-[11px] text-white/35">
                Order ID: {orderId}
              </p>
            )}
          </>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {(localStatus === "failed" || localStatus === "cancelled") && (
            <button
              type="button"
              onClick={handleTryAgain}
              className="w-full rounded-[12px] bg-gradient-to-b from-[#fff59a] via-[#ffd84a] to-[#f4c21f] px-5 py-3 text-sm font-extrabold text-black transition active:scale-95"
            >
              Try Again
            </button>
          )}

          <button
            type="button"
            onClick={handleGoHome}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-[#353535] bg-[#121515] px-5 py-3 text-sm font-bold text-white transition active:scale-95"
          >
            <Home size={16} />
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;