import { useDispatch, useSelector } from "react-redux";
import { MdRefresh } from "react-icons/md";
import { FaSpinner } from "react-icons/fa";
import { checkGameBalance } from "../reducer/gameSlice";
import { useEffect, useState } from "react";
import BalancePopup from "./BalancePopup";

const GameBalanceCheckButton = () => {
  const dispatch = useDispatch();

  const {
    isBalanceLoading,
    balanceMessage,
    balanceStatus,
  } = useSelector((state) => state.game);

  const [showPopup, setShowPopup] = useState(false);

  const handleCheckBalance = () => {
    dispatch(checkGameBalance());
  };

  useEffect(() => {
    if (balanceMessage) {
      setShowPopup(true);
    }
  }, [balanceMessage]);

  return (
    <>
      <button
        onClick={handleCheckBalance}
        disabled={isBalanceLoading}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                   flex items-center gap-2 disabled:opacity-60"
      >
        {isBalanceLoading ? (
          <>
            <FaSpinner className="animate-spin" />
            Checking...
          </>
        ) : (
          <>
            <MdRefresh />
            Check Balance
          </>
        )}
      </button>

      {showPopup && (
        <BalancePopup
          message={balanceMessage}
          status={balanceStatus}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  );
};

export default GameBalanceCheckButton;
