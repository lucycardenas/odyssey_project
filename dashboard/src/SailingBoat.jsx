
import { motion } from "framer-motion";
import "./SailingBoat.css";

export default function SailingBoat() {
  return (
    <motion.div
      className="boat-scene"
      initial={{ opacity: 0, y: 35 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
    >
      <div className="water">
        <div className="wave wave-one" />
        <div className="wave wave-two" />
        <div className="wave wave-three" />
      </div>

      <div className="boat">
        <svg
          viewBox="0 0 300 180"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Sail */}
          <path
            d="M145 15 L145 110 L75 110 Z"
            fill="#171717"
          />

          <path
            d="M155 30 L155 110 L235 110 Z"
            fill="#171717"
          />

          {/* Mast */}
          <path
            d="M150 8 L150 135"
            stroke="#171717"
            strokeWidth="5"
          />

          {/* Boat body */}
          <path
            d="M35 125 Q150 165 265 125 L240 155 Q150 180 60 155 Z"
            fill="#171717"
          />
        </svg>
      </div>
    </motion.div>
  );
}
