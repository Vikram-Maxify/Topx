import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

// ======================================================
// GAME DATA - 6 games per tab
// ======================================================

const gamesData = {
  all: [
    {
      id: 1,
      name: "Fortune Tiger",
      provider: "PG",
      image: "https://i.ibb.co/C3tnDWSJ/trx.png",
      link: "/game/fortune-tiger",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
    {
      id: 2,
      name: "Aviator",
      provider: "SPRIBE",
      image: "https://i.ibb.co/k6YjJZ0/aviator.png",
      link: "/game/aviator",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
    {
      id: 3,
      name: "Gates of Olympus",
      provider: "PRAGMATIC PLAY",
      image: "https://i.ibb.co/6R0jJZ0/gates-of-olympus.png",
      link: "/game/gates-of-olympus",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
    {
      id: 4,
      name: "Sweet Bonanza",
      provider: "PRAGMATIC PLAY",
      image: "https://i.ibb.co/k6YjJZ0/sweet-bonanza.png",
      link: "/game/sweet-bonanza",
      badge: "NEW",
      badgeColor: "bg-[#00E676]",
    },
    {
      id: 5,
      name: "Mighty Buffalo",
      provider: "PLAYSON",
      image: "https://i.ibb.co/6R0jJZ0/mighty-buffalo.png",
      link: "/game/mighty-buffalo",
      badge: null,
      badgeColor: "",
    },
    {
      id: 6,
      name: "Joker's Jewels",
      provider: "BRAGMATIC PLAY",
      image: "https://i.ibb.co/k6YjJZ0/jokers-jewels.png",
      link: "/game/jokers-jewels",
      badge: "NEW",
      badgeColor: "bg-[#00E676]",
    },
  ],
  slots: [
    {
      id: 7,
      name: "Fortune Tiger",
      provider: "PG",
      image: "https://i.ibb.co/6R0jJZ0/fortune-tiger.png",
      link: "/game/fortune-tiger",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
    {
      id: 8,
      name: "Gates of Olympus",
      provider: "PRAGMATIC PLAY",
      image: "https://i.ibb.co/6R0jJZ0/gates-of-olympus.png",
      link: "/game/gates-of-olympus",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
    {
      id: 9,
      name: "Sweet Bonanza",
      provider: "PRAGMATIC PLAY",
      image: "https://i.ibb.co/k6YjJZ0/sweet-bonanza.png",
      link: "/game/sweet-bonanza",
      badge: "NEW",
      badgeColor: "bg-[#00E676]",
    },
    {
      id: 10,
      name: "Mighty Buffalo",
      provider: "PLAYSON",
      image: "https://i.ibb.co/6R0jJZ0/mighty-buffalo.png",
      link: "/game/mighty-buffalo",
      badge: null,
      badgeColor: "",
    },
    {
      id: 11,
      name: "Joker's Jewels",
      provider: "BRAGMATIC PLAY",
      image: "https://i.ibb.co/k6YjJZ0/jokers-jewels.png",
      link: "/game/jokers-jewels",
      badge: "NEW",
      badgeColor: "bg-[#00E676]",
    },
    {
      id: 12,
      name: "Fortune Tiger",
      provider: "PG",
      image: "https://i.ibb.co/6R0jJZ0/fortune-tiger.png",
      link: "/game/fortune-tiger",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
  ],
  live: [
    {
      id: 13,
      name: "Roulette",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/k6YjJZ0/roulette.png",
      link: "/game/roulette",
      badge: null,
      badgeColor: "",
    },
    {
      id: 14,
      name: "Blackjack",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/6R0jJZ0/blackjack.png",
      link: "/game/blackjack",
      badge: null,
      badgeColor: "",
    },
    {
      id: 15,
      name: "Baccarat",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/k6YjJZ0/baccarat.png",
      link: "/game/baccarat",
      badge: null,
      badgeColor: "",
    },
    {
      id: 16,
      name: "Andar Bahar",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/6R0jJZ0/andar-bahar.png",
      link: "/game/andar-bahar",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
    {
      id: 17,
      name: "Teen Patti",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/k6YjJZ0/teen-patti.png",
      link: "/game/teen-patti",
      badge: null,
      badgeColor: "",
    },
    {
      id: 18,
      name: "Dragon Tiger",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/6R0jJZ0/dragon-tiger.png",
      link: "/game/dragon-tiger",
      badge: "HOT",
      badgeColor: "bg-[#E74C3C]",
    },
  ],
  table: [
    {
      id: 19,
      name: "Dice",
      provider: "BGAMING",
      image: "https://i.ibb.co/k6YjJZ0/dice.png",
      link: "/game/dice",
      badge: null,
      badgeColor: "",
    },
    {
      id: 20,
      name: "Plinko",
      provider: "BGAMING",
      image: "https://i.ibb.co/6R0jJZ0/plinko.png",
      link: "/game/plinko",
      badge: null,
      badgeColor: "",
    },
    {
      id: 21,
      name: "Limbo",
      provider: "BGAMING",
      image: "https://i.ibb.co/k6YjJZ0/limbo.png",
      link: "/game/limbo",
      badge: null,
      badgeColor: "",
    },
    {
      id: 22,
      name: "Roulette",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/k6YjJZ0/roulette.png",
      link: "/game/roulette",
      badge: null,
      badgeColor: "",
    },
    {
      id: 23,
      name: "Blackjack",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/6R0jJZ0/blackjack.png",
      link: "/game/blackjack",
      badge: null,
      badgeColor: "",
    },
    {
      id: 24,
      name: "Baccarat",
      provider: "EVOLUTION",
      image: "https://i.ibb.co/6R0jJZ0/baccarat.png",
      link: "/game/baccarat",
      badge: null,
      badgeColor: "",
    },
  ],
};

// ======================================================
// TABS
// ======================================================

const tabs = [
  { id: "all", label: "All" },
  { id: "slots", label: "Slots" },
  { id: "live", label: "Live Casino" },
  { id: "table", label: "Table Games" },
];

// ======================================================
// COMPONENT
// ======================================================

export default function CasinoSlotGames() {
  const [activeTab, setActiveTab] = useState("all");
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 });

  const tabsWrapRef = useRef(null);
  const tabRefs = useRef({});

  // Measure & move the sliding pill to sit exactly under the active tab
  const updateSlider = () => {
    const activeEl = tabRefs.current[activeTab];
    const wrapEl = tabsWrapRef.current;
    if (!activeEl || !wrapEl) return;

    setSliderStyle({
      left: activeEl.offsetLeft,
      width: activeEl.offsetWidth,
    });
  };

  // Reposition whenever the active tab changes
  useLayoutEffect(() => {
    updateSlider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reposition on window resize (labels can wrap/reflow on smaller screens)
  useEffect(() => {
    window.addEventListener("resize", updateSlider);
    return () => window.removeEventListener("resize", updateSlider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentGames = gamesData[activeTab] || gamesData.all;

  return (
    <section className="w-full bg-[#0B0410] px-4 py-5 sm:px-6">
      {/* ================= HEADER ================= */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[22px]">🎰</span>
          <h2 className="text-[20px] font-extrabold tracking-tight text-white sm:text-[24px]">
            Casino & Slot Games
          </h2>
        </div>
        <Link
          to="/casino"
          className="flex items-center gap-1 text-sm font-bold text-gray-300 bg-[#1C0F2B] border border-[#2a1b3d] px-3 py-1.5 rounded-lg hover:bg-[#2a1b3d] hover:text-white transition-all sm:text-base"
        >
          View all
          <span className="text-lg">›</span>
        </Link>
      </div>

      {/* ================= TABS (sliding toggle) ================= */}
      <div
        ref={tabsWrapRef}
        className="relative mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1"
      >
        {/* Sliding gradient pill — glides to whichever tab is active */}
        <div
          className="absolute top-0 h-[38px] rounded-full border border-[#C77AFF] bg-gradient-to-br from-[#B45CFF] via-[#7418F5] to-[#3A00C9] shadow-[0_0_8px_#B45CFF,0_0_18px_rgba(139,43,255,0.75),inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-5px_8px_rgba(30,0,100,0.45)] transition-all duration-300 ease-out"
          style={{
            left: sliderStyle.left,
            width: sliderStyle.width,
          }}
        />

        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[tab.id] = el)}
            onClick={() => setActiveTab(tab.id)}
            className={`relative z-10 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors duration-300 ${
              activeTab === tab.id
                ? "text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================= GAMES GRID ================= */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
        {currentGames.map((game) => (
          <Link
            key={game.id}
            to={game.link}
            className="group relative rounded-2xl overflow-hidden bg-[#1C0F2B] border border-[#2a1b3d] shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition duration-300 hover:border-[#9B59B6]/50 hover:shadow-[0_6px_18px_rgba(155,89,182,0.2)]"
          >
            {/* Game Image */}
            <div className="relative aspect-square w-full overflow-hidden">
              <img
                src={game.image}
                alt={game.name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                loading="lazy"
              />

              {/* Badge (HOT / NEW) */}
              {game.badge && (
                <span
                  className={`absolute top-2 right-2 ${game.badgeColor} text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md`}
                >
                  {game.badge}
                </span>
              )}

              {/* Gradient Overlay at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0B0410] via-[#0B0410]/70 to-transparent"></div>

              {/* Game Name + Provider over image */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <h3 className="text-sm font-bold text-white leading-tight truncate">
                  {game.name}
                </h3>
                <p className="text-[10px] text-gray-400 font-medium truncate mt-0.5">
                  {game.provider}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
