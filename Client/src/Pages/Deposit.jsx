import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  QrCode,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { createDeposit } from "../redux/slices/depositSlice";

// ======================================================
// STATIC QWACKPAY METHOD
// ======================================================
const QWACKPAY_METHOD = {
  title: "QwackPay",
  type: "upi",
  channel: "qwackpay",
  processingTime: "Instant",
};

// Backend QwackPay limits (INR)
const QWACKPAY_MIN_INR = 200;
const QWACKPAY_MAX_INR = 30000;

// ======================================================
// COUNTRY NORMALIZER
// ======================================================
const normalizeCountryCode = (country) => {
  const value = String(country || "").trim().toLowerCase();

  const countryAliases = {
    in: "IN", india: "IN",
    au: "AU", australia: "AU",
    pk: "PK", pakistan: "PK",
    bd: "BD", bangladesh: "BD",
    np: "NP", nepal: "NP",
    ae: "AE", uae: "AE", dubai: "AE", "united arab emirates": "AE",
    ca: "CA", canada: "CA",
    us: "US", usa: "US", "united states": "US",
    gb: "GB", uk: "GB", "united kingdom": "GB",
    nz: "NZ", "new zealand": "NZ",
    sg: "SG", singapore: "SG",
    my: "MY", malaysia: "MY",
    ph: "PH", philippines: "PH",
    jp: "JP", japan: "JP",
    cn: "CN", china: "CN",
    th: "TH", thailand: "TH",
    id: "ID", indonesia: "ID",
    vn: "VN", vietnam: "VN",
    tr: "TR", turkey: "TR",
    sa: "SA", "saudi arabia": "SA",
    za: "ZA", "south africa": "ZA",
    ng: "NG", nigeria: "NG",
    ke: "KE", kenya: "KE",
    br: "BR", brazil: "BR",
    mx: "MX", mexico: "MX",
    de: "DE", germany: "DE",
    fr: "FR", france: "FR",
    it: "IT", italy: "IT",
    es: "ES", spain: "ES",
  };

  return countryAliases[value] || value.toUpperCase() || "IN";
};

// ======================================================
// CURRENCY CONFIG
// ======================================================
const getCurrencyConfig = (countryCode) => {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const config = {
    IN: { symbol: "₹", code: "INR", locale: "en-IN", name: "Indian Rupee" },
    NP: { symbol: "रू", code: "NPR", locale: "ne-NP", name: "Nepali Rupee" },
    AU: { symbol: "A$", code: "AUD", locale: "en-AU", name: "Australian Dollar" },
    PK: { symbol: "₨", code: "PKR", locale: "en-PK", name: "Pakistani Rupee" },
    BD: { symbol: "৳", code: "BDT", locale: "en-BD", name: "Bangladeshi Taka" },
    AE: { symbol: "د.إ", code: "AED", locale: "ar-AE", name: "UAE Dirham" },
    CA: { symbol: "C$", code: "CAD", locale: "en-CA", name: "Canadian Dollar" },
    US: { symbol: "$", code: "USD", locale: "en-US", name: "US Dollar" },
    GB: { symbol: "£", code: "GBP", locale: "en-GB", name: "British Pound" },
    NZ: { symbol: "NZ$", code: "NZD", locale: "en-NZ", name: "New Zealand Dollar" },
    SG: { symbol: "S$", code: "SGD", locale: "en-SG", name: "Singapore Dollar" },
    MY: { symbol: "RM", code: "MYR", locale: "ms-MY", name: "Malaysian Ringgit" },
    PH: { symbol: "₱", code: "PHP", locale: "en-PH", name: "Philippine Peso" },
    JP: { symbol: "¥", code: "JPY", locale: "ja-JP", name: "Japanese Yen" },
    CN: { symbol: "¥", code: "CNY", locale: "zh-CN", name: "Chinese Yuan" },
    TH: { symbol: "฿", code: "THB", locale: "th-TH", name: "Thai Baht" },
    ID: { symbol: "Rp", code: "IDR", locale: "id-ID", name: "Indonesian Rupiah" },
    VN: { symbol: "₫", code: "VND", locale: "vi-VN", name: "Vietnamese Dong" },
    TR: { symbol: "₺", code: "TRY", locale: "tr-TR", name: "Turkish Lira" },
    SA: { symbol: "﷼", code: "SAR", locale: "ar-SA", name: "Saudi Riyal" },
    ZA: { symbol: "R", code: "ZAR", locale: "en-ZA", name: "South African Rand" },
    NG: { symbol: "₦", code: "NGN", locale: "en-NG", name: "Nigerian Naira" },
    KE: { symbol: "KSh", code: "KES", locale: "en-KE", name: "Kenyan Shilling" },
    BR: { symbol: "R$", code: "BRL", locale: "pt-BR", name: "Brazilian Real" },
    MX: { symbol: "MX$", code: "MXN", locale: "es-MX", name: "Mexican Peso" },
    DE: { symbol: "€", code: "EUR", locale: "de-DE", name: "Euro" },
    FR: { symbol: "€", code: "EUR", locale: "fr-FR", name: "Euro" },
    IT: { symbol: "€", code: "EUR", locale: "it-IT", name: "Euro" },
    ES: { symbol: "€", code: "EUR", locale: "es-ES", name: "Euro" },
    default: { symbol: "₹", code: "INR", locale: "en-IN", name: "Indian Rupee" },
  };
  return config[normalizedCountryCode] || config.default;
};

// ======================================================
// PRESET AMOUNTS (in user's local currency)
// Values chosen so INR equivalent roughly falls in 200–30000
// ======================================================
const getPresetAmounts = (countryCode) => {
  const code = normalizeCountryCode(countryCode);

  // For INR-based countries, show realistic INR values
  if (code === "IN" || code === "NP" || code === "PK" || code === "BD") {
    return [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000];
  }

  // For USD-based countries, show USD values (× ~83 = INR)
  if (code === "US") return [3, 6, 12, 25, 60, 120, 240, 300, 360];
  if (code === "AU") return [5, 10, 20, 40, 90, 180, 360, 450, 540];
  if (code === "CA") return [5, 10, 20, 35, 80, 160, 320, 400, 490];
  if (code === "NZ") return [5, 10, 20, 40, 100, 200, 400, 500, 600];
  if (code === "SG") return [5, 10, 20, 35, 80, 160, 320, 400, 480];
  if (code === "GB") return [2, 5, 10, 20, 50, 100, 190, 240, 285];
  if (code === "AE") return [10, 25, 50, 90, 220, 450, 900, 1100, 1300];
  if (code === "SA") return [10, 25, 50, 90, 225, 450, 900, 1150, 1350];
  if (code === "MY") return [10, 30, 55, 110, 280, 550, 1100, 1400, 1650];
  if (code === "PH") return [140, 350, 700, 1400, 3450, 6900, 13800, 17250, 20600];
  if (code === "JP") return [360, 900, 1800, 3600, 9000, 18000, 36000, 45000, 54000];
  if (code === "CN") return [15, 45, 90, 175, 435, 870, 1740, 2175, 2600];
  if (code === "TH") return [85, 215, 435, 870, 2175, 4350, 8700, 10870, 13040];
  if (code === "ID") return [38000, 95000, 190000, 380000, 950000, 1900000, 3800000, 4700000, 5600000];
  if (code === "VN") return [60000, 150000, 300000, 600000, 1500000, 3000000, 6000000, 7500000, 9000000];
  if (code === "TR") return [85, 210, 420, 840, 2100, 4200, 8400, 10500, 12600];
  if (code === "ZA") return [45, 110, 220, 445, 1110, 2220, 4450, 5550, 6650];
  if (code === "NG") return [3600, 9100, 18200, 36400, 90900, 182000, 364000, 455000, 545000];
  if (code === "KE") return [310, 780, 1560, 3120, 7800, 15600, 31200, 39000, 46800];
  if (code === "BR") return [13, 33, 66, 130, 330, 660, 1320, 1650, 1980];
  if (code === "MX") return [45, 115, 230, 465, 1160, 2325, 4650, 5815, 6975];

  // EUR countries
  if (["DE", "FR", "IT", "ES"].includes(code)) {
    return [2, 6, 11, 22, 55, 110, 220, 275, 335];
  }

  return [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000];
};

// ======================================================
// COMPONENT
// ======================================================
const Deposit = () => {
  const dispatch = useDispatch();

  const { loading } = useSelector((state) => state.deposit);
  const { user } = useSelector((state) => state.auth);

  // ======================================================
  // CURRENCY CONFIG
  // ======================================================
  const countryCode = useMemo(
    () => normalizeCountryCode(user?.country || "IN"),
    [user?.country]
  );

  const currencyConfig = useMemo(
    () => getCurrencyConfig(countryCode),
    [countryCode]
  );

  const currencySymbol = currencyConfig.symbol;
  const currencyCode = currencyConfig.code;
  const locale = currencyConfig.locale;

  const presetAmounts = useMemo(
    () => getPresetAmounts(countryCode),
    [countryCode]
  );

  // ======================================================
  // STATE
  // ======================================================
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ======================================================
  // FORMAT CURRENCY
  // ======================================================
  const formatCurrency = (value) => {
    if (value === "" || value === null || value === undefined) {
      return `${currencySymbol}0`;
    }
    const num = parseFloat(value);
    if (isNaN(num)) return `${currencySymbol}0`;
    return `${currencySymbol}${num.toLocaleString(locale)}`;
  };

  // ======================================================
  // VALIDATION
  // Only checks: not empty, is finite number, > 0.
  // Min/max INR check happens on backend after conversion.
  // ======================================================
  const validateAmount = (value) => {
    if (value === "" || value === null || value === undefined) {
      return "Please enter an amount";
    }

    const num = parseFloat(value);

    if (!Number.isFinite(num)) {
      return "Please enter a valid amount";
    }

    if (num <= 0) {
      return "Amount must be greater than 0";
    }

    return "";
  };

  // ======================================================
  // HANDLERS
  // ======================================================
  const handlePresetClick = (value) => {
    const stringValue = String(value);
    setAmount(stringValue);
    setTouched(true);
    setError(validateAmount(stringValue));
  };

  const handleAmountChange = (e) => {
    const value = e.target.value;
    setAmount(value);
    if (touched) setError(validateAmount(value));
  };

  const handleBlur = () => {
    setTouched(true);
    setError(validateAmount(amount));
  };

  // ======================================================
  // PROCEED → CREATE QWACKPAY ORDER → REDIRECT
  // ======================================================
  const proceedHandler = async () => {
    const amountError = validateAmount(amount);
    setTouched(true);
    setError(amountError);

    if (amountError) {
      toast.error(amountError);
      return;
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Invalid amount");
      setError("Invalid amount");
      return;
    }

    try {
      setSubmitting(true);

      // Send as plain JSON — backend expects form fields
      // but JSON works too since multer isn't required for qwackpay.
      const payload = {
        amount: numericAmount,
        channel: "qwackpay",
        country: countryCode,
        currency: currencyCode,
        paymentMethod: "INR",
      };

      console.log("CREATE DEPOSIT PAYLOAD:", payload);

      const result = await dispatch(createDeposit(payload)).unwrap();

      console.log("CREATE DEPOSIT RESULT:", result);

      if (result?.paymentUrl) {
        toast.success("Redirecting to payment gateway...");
        // Small delay so toast is visible
        setTimeout(() => {
          window.location.href = result.paymentUrl;
        }, 300);
        return;
      }

      const message =
        result?.message || "Payment URL not received from gateway";
      toast.error(message);
      setSubmitting(false);
    } catch (err) {
      console.error("CREATE DEPOSIT ERROR:", err);

      const message =
        typeof err === "string"
          ? err
          : err?.message || "Failed to create deposit";

      toast.error(message);
      setSubmitting(false);
    }
  };

  const canProceed =
    amount !== "" && !validateAmount(amount) && !submitting;

  // ======================================================
  // UI
  // ======================================================
  return (
    <div className="relative min-h-screen bg-[#0B0410] overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 bg-[#9B59B6]/20 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-24 w-64 h-64 bg-[#8E44AD]/15 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 bg-[#9B59B6]/10 rounded-full blur-3xl" />

      <div className="relative px-4 sm:px-6 py-6">
        <div className="max-w-md w-full mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#B45CFF] via-[#7418F5] to-[#3A00C9] border border-[#C77AFF] shadow-[0_0_8px_#B45CFF,0_0_18px_rgba(139,43,255,0.75),inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-5px_8px_rgba(30,0,100,0.45)] flex items-center justify-center mb-3">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Deposit Funds
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Enter an amount to continue with QwackPay
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#9B59B6]/10 border border-[#9B59B6]/40 rounded-full">
              <span className="text-[10px] font-medium text-[#9B59B6]">
                Currency: {currencySymbol} {currencyCode}
              </span>
            </div>
          </div>

          {/* QwackPay Method */}
          <div className="mb-5 bg-[#1C0F2B] rounded-2xl border border-[#2a1b3d] shadow-[0_4px_16px_rgba(0,0,0,0.5)] p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Payment Method
            </h3>

            <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-[#C77AFF] bg-gradient-to-br from-[#B45CFF] via-[#7418F5] to-[#3A00C9] shadow-[0_0_8px_#B45CFF,0_0_18px_rgba(139,43,255,0.75),inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-5px_8px_rgba(30,0,100,0.45)]">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/20 text-white backdrop-blur-sm">
                <QrCode className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">
                  {QWACKPAY_METHOD.title}
                </p>
                <p className="text-[11px] text-gray-100 flex items-center gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {QWACKPAY_METHOD.processingTime}
                </p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />
            </div>

            <p className="mt-3.5 text-[11px] text-gray-400">
              Limit: ₹{QWACKPAY_MIN_INR} – ₹{QWACKPAY_MAX_INR} (INR
              equivalent)
            </p>
          </div>

          {/* Amount Section */}
          <div className="bg-[#1C0F2B] rounded-2xl border border-[#2a1b3d] shadow-[0_4px_16px_rgba(0,0,0,0.5)] p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Amount ({currencySymbol})
            </h3>

            <div className="grid grid-cols-3 gap-2.5 mb-5">
              {presetAmounts.map((val) => (
                <button
                  type="button"
                  key={val}
                  onClick={() => handlePresetClick(val)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    String(amount) === String(val)
                      ? "bg-gradient-to-br from-[#B45CFF] via-[#7418F5] to-[#3A00C9] border border-[#C77AFF] shadow-[0_0_8px_#B45CFF,0_0_18px_rgba(139,43,255,0.75),inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-5px_8px_rgba(30,0,100,0.45)] text-white"
                      : "bg-[#12061C] text-gray-300 border border-[#2a1b3d] hover:border-[#9B59B6]/50 hover:bg-[#2a1b3d]/50"
                  }`}
                >
                  {formatCurrency(val)}
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Custom amount
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                {currencySymbol}
              </span>
              <input
                type="number"
                inputMode="decimal"
                className={`w-full rounded-xl border p-3 pl-8 text-sm text-white bg-[#12061C] transition focus:outline-none focus:ring-2 ${
                  touched && error
                    ? "border-red-500/50 focus:ring-red-500/20 bg-red-500/5"
                    : touched && !error && amount
                    ? "border-[#00E676]/50 focus:ring-[#00E676]/20 bg-[#00E676]/5"
                    : "border-[#2a1b3d] focus:ring-[#9B59B6]/20 focus:border-[#9B59B6]/50"
                }`}
                value={amount}
                onChange={handleAmountChange}
                onBlur={handleBlur}
                placeholder={`Enter amount in ${currencyCode}`}
                step="any"
                min="0"
                disabled={submitting}
              />
            </div>
            {touched && error && (
              <p className="mt-1.5 text-[11px] text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </p>
            )}
          </div>

          {/* Summary + Proceed */}
          <div className="mt-5 bg-[#1C0F2B] rounded-2xl border border-[#2a1b3d] shadow-[0_4px_16px_rgba(0,0,0,0.5)] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-400 font-medium">
                You'll deposit
              </span>
              <span className="text-xl font-bold text-white">
                {amount ? formatCurrency(amount) : `${currencySymbol}0`}
              </span>
            </div>
            <button
              type="button"
              disabled={loading || submitting || !canProceed}
              onClick={proceedHandler}
              className={`w-full font-semibold py-3.5 px-4 rounded-xl transition-all duration-200 text-sm flex items-center justify-center gap-1.5 ${
                loading || submitting || !canProceed
                  ? "bg-[#2a1b3d] text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-br from-[#B45CFF] via-[#7418F5] to-[#3A00C9] border border-[#C77AFF] shadow-[0_0_8px_#B45CFF,0_0_18px_rgba(139,43,255,0.75),inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-5px_8px_rgba(30,0,100,0.45)] text-white active:scale-[0.98]"
              }`}
            >
              {submitting || loading ? "Redirecting..." : "Proceed to Payment"}
              {!submitting && !loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Deposit;