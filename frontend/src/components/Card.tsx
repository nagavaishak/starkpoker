"use client";

import { useState, useEffect } from "react";
import { cardDisplay } from "@/lib/contracts";

interface CardProps {
  index?: number;       // 0-51; undefined = face-down
  revealed?: boolean;
  size?: "sm" | "md" | "lg";
  dealDelay?: number;   // ms delay before animating in
}

const sizes = {
  sm:  "w-12 h-16 text-sm",
  md:  "w-16 h-24 text-base",
  lg:  "w-20 h-28 text-lg",
};

export function Card({ index, revealed = false, size = "md", dealDelay = 0 }: CardProps) {
  const sz = sizes[size];
  const [flipped, setFlipped] = useState(false);
  const [visible, setVisible] = useState(dealDelay === 0);

  // Deal animation: appear after delay, then flip after short pause
  useEffect(() => {
    if (!revealed || index === undefined) return;
    const t1 = setTimeout(() => setVisible(true), dealDelay);
    const t2 = setTimeout(() => setFlipped(true), dealDelay + 120);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [revealed, index, dealDelay]);

  // Reset when card goes face-down again
  useEffect(() => {
    if (!revealed) { setFlipped(false); setVisible(dealDelay === 0); }
  }, [revealed, dealDelay]);

  const isRevealed = revealed && index !== undefined;
  const { rank, suit, color } = isRevealed && flipped
    ? cardDisplay(index!)
    : { rank: "", suit: "", color: "" };
  const isRed = color.includes("red");

  return (
    <div
      className={`${sz} rounded-lg shadow-lg select-none
        transition-all duration-300
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      style={{ perspective: "600px" }}
    >
      <div
        className="relative w-full h-full"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.45s ease",
        }}
      >
        {/* Back face */}
        <div
          className="absolute inset-0 rounded-lg flex items-center justify-center
            bg-gradient-to-br from-blue-900 to-blue-700 border-2 border-blue-500"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="text-blue-300 text-2xl">🂠</span>
        </div>

        {/* Front face */}
        <div
          className="absolute inset-0 rounded-lg flex flex-col items-center justify-center
            bg-white border-2 border-gray-300"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {flipped && (
            <>
              <span className={`font-bold leading-none text-lg ${isRed ? "text-red-600" : "text-gray-900"}`}>
                {rank}
              </span>
              <span className={`text-xl leading-none ${isRed ? "text-red-600" : "text-gray-900"}`}>
                {suit}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A row of 5 cards with staggered deal animation
export function HandDisplay({
  indices,
  revealed,
  size = "md",
}: {
  indices: number[];
  revealed: boolean;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex gap-2 justify-center">
      {[0, 1, 2, 3, 4].map((i) => (
        <Card
          key={i}
          index={indices[i]}
          revealed={revealed && indices[i] !== undefined}
          size={size}
          dealDelay={i * 120}  // staggered deal
        />
      ))}
    </div>
  );
}
