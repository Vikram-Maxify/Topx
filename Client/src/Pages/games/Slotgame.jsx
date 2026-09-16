import { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MdPlayCircle, MdWarning } from "react-icons/md";
import {
  FaSpinner,
  FaSearch,
  FaArrowLeft,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import { SlotsGames } from "../../Data/GamesData";
import GamePlayModal from "../../components/GamePlayModal";

import {
  getGamesByGameType,
  launchGame,
  resetGameState,
  clearGameUrl,
} from "../../reducer/gameSlice";

const Slotgame = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { userprofile, stats } = useSelector((state) => state.auth);
  const { gamesByGameType, loading, gameUrl, launchLoading, launchError } =
    useSelector((state) => state.game);

  /* ===========================
     LOCAL STATE
  =========================== */
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [gamesPerPage] = useState(24);
  const [hasRequestedGames, setHasRequestedGames] = useState(false);
  const [useFallbackData, setUseFallbackData] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  const MIN_CREDIT_TO_PLAY = 10;
  const hasDeposited = (stats?.totalDeposits || 0) > 0;
  const credit = Number(userprofile?.credit || 0);
  const needsRecharge = !hasDeposited || credit < MIN_CREDIT_TO_PLAY;

  // console.log(SlotsGames);

  useEffect(() => {
    dispatch(resetGameState());
  }, [dispatch]);

  /* ===========================
     AUTO OPEN MODAL (🔥 SAME AS AVIATOR)
  =========================== */
  useEffect(() => {
    if (gameUrl) {
      setIsGameModalOpen(true);
    }
  }, [gameUrl]);

  useEffect(() => {
    dispatch(
      getGamesByGameType({ page: 1, limit: 1000, game_type: "Slot Game" }),
    );
    setHasRequestedGames(true);
  }, [dispatch]);

  useEffect(() => {
    if (!hasRequestedGames || loading) return;

    const noApiGames =
      !Array.isArray(gamesByGameType) || gamesByGameType.length === 0;
    setUseFallbackData(noApiGames);
  }, [gamesByGameType, hasRequestedGames, loading]);

  const showGamesLoader =
    hasRequestedGames && loading && !Array.isArray(gamesByGameType);

  /* ===========================
     FILTER GAMES BY SEARCH
  =========================== */
  const filteredGames = useMemo(() => {
    const sourceGames = useFallbackData
      ? SlotsGames
      : Array.isArray(gamesByGameType)
        ? gamesByGameType
        : [];

    if (!searchTerm.trim()) return sourceGames;

    return sourceGames.filter((game) =>
      game.game_name?.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [searchTerm, gamesByGameType]);

  /* ===========================
     PAGINATION CALCULATION
  =========================== */
  const totalPages = Math.ceil(filteredGames.length / gamesPerPage);
  const indexOfLastGame = currentPage * gamesPerPage;
  const indexOfFirstGame = indexOfLastGame - gamesPerPage;
  const currentGames = filteredGames.slice(indexOfFirstGame, indexOfLastGame);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  /* ===========================
     GAME CLICK (🔥 SAME LOGIC)
  =========================== */
  const handlePlay = async (game) => {
    if (!needsRecharge) {
      setSelectedGame(game);
      setShowRechargeModal(true);
      return;
    }

    try {
      setSelectedGame(game);
      await dispatch(launchGame({ gameId: game.game_uid })).unwrap();
    } catch (err) {
      alert(err || "Failed to launch game");
    }
  };

  /* ===========================
     MODAL CLOSE
  =========================== */
  const closeGameModal = () => {
    setIsGameModalOpen(false);
    setSelectedGame(null);
    dispatch(clearGameUrl());
  };

  /* ===========================
     PAGINATION HANDLERS
  =========================== */
  const goToPage = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisiblePages - 1);

      if (end - start + 1 < maxVisiblePages) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }

      if (start > 1) {
        pageNumbers.push(1);
        if (start > 2) pageNumbers.push("...");
      }

      for (let i = start; i <= end; i++) {
        pageNumbers.push(i);
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pageNumbers.push("...");
        pageNumbers.push(totalPages);
      }
    }

    return pageNumbers;
  };

  /* ===========================
     UI
  =========================== */
  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 md:p-6">
        <div className=" mx-auto">
          {/* HEADER WITH BACK BUTTON AND SEARCH */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            {/* Back Button */}
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-gray-300 hover:text-white text-sm font-bold transition-colors bg-gray-800/50 hover:bg-gray-800 px-4 py-2 rounded-xl"
              >
                <FaArrowLeft /> Back
              </button>

              <h1 className="text-lg md:text-xl font-bold text-white">
                Live Casino Games
              </h1>
            </div>

            {/* Search Box */}
            <div className="relative w-full md:w-80">
              <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search live casino games..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
            </div>
          </div>

          {showGamesLoader ? (
            <div className="rounded-2xl border border-gray-700/60 bg-gray-900/60 py-20 text-center">
              <FaSpinner className="animate-spin text-4xl text-orange-400 mx-auto mb-4" />
              <h3 className="text-white text-lg font-semibold mb-2">
                Loading slot games...
              </h3>
              <p className="text-gray-400 text-sm">
                Please wait while we fetch latest games
              </p>
            </div>
          ) : (
            <>
              {/* GAME GRID – RESPONSIVE */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {currentGames.map((game) => (
                  <div
                    key={game.game_uid || game.id}
                    onClick={() => handlePlay(game)}
                    className="relative cursor-pointer rounded-xl overflow-hidden 
                          aspect-[3/4] bg-gray-900 group shadow-lg hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 border border-gray-800 hover:border-orange-500/50/50"
                  >
                    {/* GAME IMAGE */}
                    <img
                      src={game.img || game.icon}
                      alt={game.game_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* HOVER OVERLAY */}
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent 
                            opacity-0 group-hover:opacity-100 flex items-center 
                            justify-center transition-opacity duration-300"
                    >
                      {launchLoading &&
                      selectedGame?.game_uid === game.game_uid ? (
                        <FaSpinner className="animate-spin text-3xl text-white" />
                      ) : (
                        <MdPlayCircle className="text-4xl md:text-5xl text-white opacity-90 group-hover:scale-110 transition-transform" />
                      )}
                    </div>

                    {/* GAME INFO OVERLAY */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black to-transparent">
                      <h3 className="text-white font-semibold text-sm truncate">
                        {game.game_name}
                      </h3>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-300 bg-gray-800/80 px-2 py-1 rounded">
                          {game.provider || "BF Gaming"}
                        </span>
                        <span className="text-xs text-yellow-400 font-medium">
                          Live
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* EMPTY STATE */}
              {currentGames.length === 0 && (
                <div className="text-center py-16 bg-gray-900/50 rounded-2xl border border-dashed border-gray-700 mt-10">
                  <FaSearch className="text-4xl text-gray-500 mx-auto mb-4" />
                  <h3 className="text-white text-lg font-semibold mb-2">
                    No games found
                  </h3>
                  <p className="text-gray-400">
                    {searchTerm
                      ? `No results for "${searchTerm}"`
                      : "No games available"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* PAGINATION */}
          {filteredGames.length > gamesPerPage && (
            <div className="mt-10">
              {/* PAGINATION CONTROLS */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                {/* PAGINATION BUTTONS */}
                <div className=" hidden sm:flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <FaChevronLeft className="text-xs" />
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {renderPageNumbers().map((pageNum, index) =>
                      pageNum === "..." ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="px-3 py-2 text-gray-500"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                            currentPage === pageNum
                              ? "bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-lg shadow-orange-500/20"
                              : "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white"
                          }`}
                        >
                          {pageNum}
                        </button>
                      ),
                    )}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                    <FaChevronRight className="text-xs" />
                  </button>
                </div>
              </div>

              {/* MOBILE PAGINATION */}
              <div className="md:hidden flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FaChevronLeft /> Prev
                </button>

                <span className="text-white font-medium">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next <FaChevronRight />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RECHARGE REQUIRED MODAL */}
      {showRechargeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-gray-900 border border-orange-500/40 rounded-2xl p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/15 border border-orange-500/40">
              <MdWarning className="text-4xl text-orange-400" />
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
                className="flex-1 px-4 py-3 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRechargeModal(false);
                  window.location.href = "/deposit";
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-600 text-white font-bold hover:from-orange-600 hover:to-yellow-700 transition-all"
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

export default Slotgame;
