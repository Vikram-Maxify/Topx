import { useEffect, useState } from "react";
import { FaCrown, FaFire, FaSpinner } from "react-icons/fa";
import { GiAirplane } from "react-icons/gi";
import { MdGamepad, MdPlayCircle, MdStar, MdWarning } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";

import GamePlayModal from "../../components/GamePlayModal";
import {
  clearGameUrl,
  launchGame,
  resetGameState,
} from "../../redux/slices/gameSlice";

const AviatorGames = () => {
  const dispatch = useDispatch();

  /* ===========================
     REDUX STATE
  =========================== */
  const { gameUrl, launchLoading, launchError } = useSelector(
    (state) => state.game,
  );

  const { user } = useSelector((state) => state.auth);

  /* ===========================
     LOCAL STATE
  =========================== */
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  const MIN_CREDIT_TO_PLAY = 10;
  const hasDeposited = true;
  const credit = Number(user?.balance || 0);
  const needsRecharge = !hasDeposited || credit < MIN_CREDIT_TO_PLAY;

  // TopX Purple gradient
  const purpleGradient =
    "bg-gradient-to-br from-[#B45CFF] via-[#7418F5] to-[#3A00C9] border border-[#C77AFF] shadow-[0_0_8px_#B45CFF,0_0_18px_rgba(139,43,255,0.75),inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-5px_8px_rgba(30,0,100,0.45)]";

  /* ===========================
     AVIATOR GAME DATA
  =========================== */
  const aviatorGame = {
    game_name: "Aviator",
    game_uid: "a04d1f3eb8ccec8a4823bdf18e3f0e84",
    game_type: "Casino Table",
    provider: "SPB",
    icon: "http://files.worldcasinoonline.com/Document/Game/Aviator_1697879631441.088.png",
    rating: 4.9,
    players: "5.6K",
    volatility: "High",
    min_bet: 10,
    max_bet: 10000,
    is_featured: true,
    is_new: false,
    description:
      "The legendary crash game where timing is everything. Cash out before the plane flies away!",
  };

  /* ===========================
     RESET ON LOAD
  =========================== */
  useEffect(() => {
    dispatch(resetGameState());
  }, [dispatch]);

  /* ===========================
     AUTO OPEN MODAL
  =========================== */
  useEffect(() => {
    if (gameUrl) setIsGameModalOpen(true);
  }, [gameUrl]);

  /* ===========================
     PLAY HANDLER
  =========================== */
  const handlePlay = async () => {
    // Block game launch if user has no deposit or insufficient balance
    if (needsRecharge) {
      setSelectedGame(aviatorGame);
      setShowRechargeModal(true);
      return;
    }

    try {
      setSelectedGame(aviatorGame);
      await dispatch(launchGame({ gameId: aviatorGame.game_uid })).unwrap();
    } catch {
      alert("Failed to launch Aviator");
    }
  };

  /* ===========================
     CLOSE MODAL
  =========================== */
  const closeGameModal = () => {
    setIsGameModalOpen(false);
    setSelectedGame(null);
    dispatch(clearGameUrl());
  };

  /* ===========================
     UI
  =========================== */
  return (
    <>
      <div className="bg-[#0B0410] p-4 sm:p-6">
        {/* HEADER (Same as Chicken) */}
        <div className="mx-auto mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-3 rounded-xl ${purpleGradient}`}>
              <GiAirplane className="text-white text-2xl" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              Aviator
            </h1>
          </div>
          <p className="text-gray-400">
            High-risk, high-reward crash game loved by millions
          </p>
        </div>

        {/* GRID (Same layout – single card centered) */}
        <div className="mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-start-1">
            <div
              onClick={handlePlay}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              className="group relative cursor-pointer
                         bg-[#1C0F2B]
                         rounded-2xl overflow-hidden
                         border border-[#2a1b3d]
                         hover:border-[#B45CFF]/60
                         hover:shadow-[0_6px_18px_rgba(155,89,182,0.25)]
                         hover:scale-[1.02]
                         transition-all duration-300"
            >
              {/* IMAGE */}
              <div className="relative aspect-[16/9] overflow-hidden">
                <img
                  src={aviatorGame.icon}
                  alt="Aviator"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0410] via-[#0B0410]/50 to-transparent" />

                {/* BADGES */}
                <div className="absolute top-3 left-3 flex gap-2">
                  {aviatorGame.is_featured && (
                    <div
                      className={`flex items-center gap-1 px-2 py-1 rounded-full ${purpleGradient}`}
                    >
                      <FaCrown className="text-white text-xs" />
                      <span className="text-white text-xs font-bold">
                        FEATURED
                      </span>
                    </div>
                  )}
                  <div className="px-2 py-1 bg-[#0B0410]/80 rounded-full border border-[#2a1b3d]">
                    <span className="text-white text-xs font-bold">
                      {aviatorGame.game_type}
                    </span>
                  </div>
                </div>

                {/* PLAY OVERLAY */}
                <div
                  className={`
                    absolute inset-0 flex items-center justify-center
                    transition-all duration-300
                    ${
                      hovered
                        ? "bg-black/70 opacity-100"
                        : "bg-black/40 opacity-100 sm:opacity-0"
                    }
                  `}
                >
                  {launchLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <FaSpinner className="animate-spin text-4xl text-white" />
                      <span className="text-white text-sm">Launching...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className={`p-4 rounded-full ${purpleGradient}`}>
                        <MdPlayCircle className="text-4xl text-white" />
                      </div>
                      <span className="text-white text-sm font-bold bg-black/50 px-4 py-2 rounded-full">
                        PLAY NOW
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* INFO */}
              <div className="p-4 sm:p-5">
                <div className="flex justify-between mb-2">
                  <h3 className="text-white font-bold text-xl">
                    {aviatorGame.game_name}
                  </h3>
                  <div className="flex items-center gap-1">
                    <MdStar className="text-[#F1C40F]" />
                    <span className="text-white font-bold">
                      {aviatorGame.rating}
                    </span>
                  </div>
                </div>

                <p className="text-gray-400 text-sm line-clamp-2 mb-4">
                  {aviatorGame.description}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <MdGamepad className="text-gray-500" />
                    <span className="text-gray-300 text-sm">
                      {aviatorGame.players} players
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FaFire className="text-[#B45CFF]" />
                    <span className="text-gray-300 text-sm">
                      {aviatorGame.volatility}
                    </span>
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#B45CFF]/40 rounded-2xl pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* RECHARGE REQUIRED MODAL */}
      {showRechargeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-[#1C0F2B] border border-[#9B59B6]/40 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.7)] text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#9B59B6]/15 border border-[#9B59B6]/40">
              <MdWarning className="text-4xl text-[#C77AFF]" />
            </div>
            <div className="text-xl font-bold text-white mb-2">
              Recharge Required
            </div>
            <p className="text-sm text-gray-300 mb-2">
              {!hasDeposited
                ? "You need to make at least one deposit before you can play."
                : `You need a minimum balance of ₹${MIN_CREDIT_TO_PLAY} to play this game.`}
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Current Balance: ₹{credit.toLocaleString()}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setShowRechargeModal(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-[#12061C] border border-[#2a1b3d] text-gray-300 hover:bg-[#2a1b3d] hover:text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRechargeModal(false);
                  window.location.href = "/deposit";
                }}
                className={`flex-1 px-4 py-3 rounded-xl ${purpleGradient} text-white font-bold transition-all active:scale-[0.98]`}
              >
                Recharge Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME MODAL */}
      <GamePlayModal
        isOpen={isGameModalOpen}
        onClose={closeGameModal}
        gameData={selectedGame}
        gameUrl={gameUrl}
        loading={launchLoading}
        launchError={launchError}
      />
    </>
  );
};

export default AviatorGames;
