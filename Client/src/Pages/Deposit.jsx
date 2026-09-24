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
// STATIC QWACKPAY METHOD (only one)
// ======================================================
const QWACKPAY_METHOD = {
  title: "QwackPay",
  type: "upi",
  channel: "qwackpay",
  minimumDeposit: 200,
  maximumDeposit: 30000,
  processingTime: "Instant",
};

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
// PRESET AMOUNTS (200 se 30000 tak)
// ======================================================
const getPresetAmounts = (countryCode) => {
  const presets = {
    IN: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    NP: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    PK: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    BD: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    AU: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    CA: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    US: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    GB: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    NZ: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    SG: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    MY: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    PH: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    JP: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    CN: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    TH: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    ID: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    VN: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    TR: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    AE: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    SA: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    ZA: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    NG: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    KE: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    BR: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    MX: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    DE: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    FR: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    IT: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
    ES: [200, 500, 1000, 2000, 5000, 10000, 20000, 25000, 30000],
  };
  return presets[countryCode] || presets.IN;
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
  const currencyConfig = useMemo(() => getCurrencyConfig(countryCode), [countryCode]);
  const currencySymbol = currencyConfig.symbol;
  const locale = currencyConfig.locale;
  const presetAmounts = useMemo(() => getPresetAmounts(countryCode), [countryCode]);

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
    if (!value) return `${currencySymbol}0`;
    const num = parseFloat(value);
    if (isNaN(num)) return `${currencySymbol}0`;
    return `${currencySymbol}${num.toLocaleString(locale)}`;
  };

  // ======================================================
  // VALIDATION
  // ======================================================
  const validateAmount = (value) => {
    const num = parseFloat(value);
    if (!value || value === "") return `Please enter an amount`;
    if (isNaN(num) || num <= 0) return `Please enter a valid amount`;
    const min = parseFloat(QWACKPAY_METHOD.minimumDeposit);
    const max = parseFloat(QWACKPAY_METHOD.maximumDeposit);
    if (num < min) return `Minimum amount is ${formatCurrency(min)}`;
    if (num > max) return `Maximum amount is ${formatCurrency(max)}`;
    return "";
  };

  // ======================================================
  // HANDLERS
  // ======================================================
  const handlePresetClick = (value) => {
    setAmount(String(value));
    setTouched(true);
    setError(validateAmount(String(value)));
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
  // PROCEED → CREATE QWACKPAY ORDER → REDIRECT TO GATEWAY
  // ======================================================
  const proceedHandler = async () => {
    const amountError = validateAmount(amount);
    setTouched(true);
    setError(amountError);

    if (amountError) {
      toast.error(amountError);
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append("amount", amount);
      formData.append("channel", "qwackpay");
      formData.append("country", countryCode);
      formData.append("currency", currencyConfig.code);
      formData.append("paymentMethod", "INR");
      formData.append("methodTitle", "QwackPay");

      const result = await dispatch(createDeposit(formData)).unwrap();

      // Backend se paymentUrl aana chahiye
      if (result?.paymentUrl) {
        toast.success("Redirecting to payment gateway...");
        // Gateway pe redirect
        window.location.href = result.paymentUrl;
      } else {
        toast.error(result?.message || "Payment URL not received");
        setSubmitting(false);
      }
    } catch (err) {
      console.error("CREATE DEPOSIT ERROR:", err);
      toast.error(typeof err === "string" ? err : "Failed to create deposit");
      setSubmitting(false);
    }
  };

  const canProceed = amount && !error && !submitting;

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
                Currency: {currencySymbol} {currencyConfig.code}
              </span>
            </div>
          </div>

          {/* QwackPay Method (static, already selected) */}
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
              Limit: {formatCurrency(QWACKPAY_METHOD.minimumDeposit)} –{" "}
              {formatCurrency(QWACKPAY_METHOD.maximumDeposit)}
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
                placeholder={`Enter amount in ${currencyConfig.code}`}
                step="0.01"
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