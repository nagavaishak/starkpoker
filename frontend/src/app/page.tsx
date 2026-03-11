"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="landing-root">
      <style>{`
        .landing-root {
          min-height: 100vh;
          background: #090f0a;
          color: #f0ede8;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(201, 168, 76, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(201, 168, 76, 0.035) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 25%, rgba(0, 0, 0, 0.72) 100%);
          pointer-events: none;
        }

        /* ── Card fan ─────────────────────────────── */
        .card-fan {
          position: relative;
          width: 300px;
          height: 170px;
          margin-bottom: 52px;
          flex-shrink: 0;
        }

        .playing-card {
          position: absolute;
          left: calc(50% - 45px);
          bottom: 0;
          width: 90px;
          height: 130px;
          border-radius: 7px;
          background: #0d2016;
          border: 1px solid rgba(201, 168, 76, 0.32);
          transform-origin: bottom center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75);
          overflow: hidden;
        }

        .card-0 { transform: translateX(-46px) rotate(-20deg); animation: float0 3.6s ease-in-out infinite alternate; }
        .card-1 { transform: translateX(-23px) rotate(-10deg); animation: float1 4.1s ease-in-out infinite alternate; animation-delay: 0.4s; }
        .card-2 { transform: translateX(0px)   rotate(0deg);   animation: float2 3.8s ease-in-out infinite alternate; animation-delay: 0.8s; }
        .card-3 { transform: translateX(23px)  rotate(10deg);  animation: float3 4.3s ease-in-out infinite alternate; animation-delay: 0.2s; }
        .card-4 { transform: translateX(46px)  rotate(20deg);  animation: float4 3.5s ease-in-out infinite alternate; animation-delay: 0.6s; }

        @keyframes float0 { from { transform: translateX(-46px) rotate(-20deg) translateY(0px); } to { transform: translateX(-46px) rotate(-20deg) translateY(-6px); } }
        @keyframes float1 { from { transform: translateX(-23px) rotate(-10deg) translateY(0px); } to { transform: translateX(-23px) rotate(-10deg) translateY(-8px); } }
        @keyframes float2 { from { transform: translateX(0px)   rotate(0deg)   translateY(0px); } to { transform: translateX(0px)   rotate(0deg)   translateY(-5px); } }
        @keyframes float3 { from { transform: translateX(23px)  rotate(10deg)  translateY(0px); } to { transform: translateX(23px)  rotate(10deg)  translateY(-7px); } }
        @keyframes float4 { from { transform: translateX(46px)  rotate(20deg)  translateY(0px); } to { transform: translateX(46px)  rotate(20deg)  translateY(-9px); } }

        .card-inner-frame {
          position: absolute;
          inset: 6px;
          border: 1px solid rgba(201, 168, 76, 0.18);
          border-radius: 3px;
          pointer-events: none;
        }

        /* ── Hero text ─────────────────────────────── */
        .hero-title {
          text-align: center;
          position: relative;
          z-index: 1;
          margin-bottom: 32px;
          line-height: 0.92;
        }

        .title-stark {
          font-family: 'Courier New', Courier, monospace;
          font-size: clamp(64px, 11vw, 108px);
          font-weight: 700;
          letter-spacing: 0.3em;
          color: #f0ede8;
          text-transform: uppercase;
          animation: breathe 5s ease-in-out infinite;
        }

        .title-poker {
          font-family: 'Courier New', Courier, monospace;
          font-size: clamp(64px, 11vw, 108px);
          font-weight: 700;
          letter-spacing: 0.3em;
          color: #c9a84c;
          text-transform: uppercase;
          animation: breathe 5s ease-in-out infinite;
          animation-delay: 0.2s;
        }

        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.78; }
        }

        /* ── Divider ───────────────────────────────── */
        .divider {
          width: min(280px, 70vw);
          height: 1px;
          background: rgba(201, 168, 76, 0.22);
          margin: 0 auto 22px;
          position: relative;
          z-index: 1;
        }

        /* ── Tagline ───────────────────────────────── */
        .tagline {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          letter-spacing: 0.26em;
          color: rgba(240, 237, 232, 0.4);
          text-transform: uppercase;
          text-align: center;
          margin: 0 0 48px;
          position: relative;
          z-index: 1;
        }

        /* ── Play button ───────────────────────────── */
        .play-btn {
          display: inline-block;
          padding: 15px 60px;
          border: 1px solid #c9a84c;
          color: #c9a84c;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          letter-spacing: 0.38em;
          text-transform: uppercase;
          text-decoration: none;
          position: relative;
          z-index: 1;
          transition: background 0.16s ease, color 0.16s ease;
          margin-bottom: 68px;
        }

        .play-btn:hover {
          background: #c9a84c;
          color: #090f0a;
        }

        /* ── Tech facts ────────────────────────────── */
        .tech-row {
          display: flex;
          gap: 20px;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          position: relative;
          z-index: 1;
          margin-bottom: 0;
        }

        .tech-item {
          font-family: 'Courier New', Courier, monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          color: rgba(240, 237, 232, 0.28);
          text-transform: uppercase;
        }

        .tech-sep {
          color: rgba(201, 168, 76, 0.25);
          font-size: 9px;
        }

        /* ── Footer ────────────────────────────────── */
        .landing-footer {
          position: absolute;
          bottom: 22px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          color: rgba(240, 237, 232, 0.16);
          text-transform: uppercase;
          text-align: center;
          width: 100%;
        }
      `}</style>

      <div className="grid-bg" />
      <div className="vignette" />

      {/* ── Card fan ── */}
      <div className="card-fan">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`playing-card card-${i}`}>
            <div className="card-inner-frame" />
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              viewBox="0 0 90 130"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern
                  id={`dp-${i}`}
                  width="9"
                  height="9"
                  patternUnits="userSpaceOnUse"
                  x="7"
                  y="7"
                >
                  <path d="M4.5,0 L9,4.5 L4.5,9 L0,4.5 Z" fill="none" stroke="#c9a84c" strokeWidth="0.45" />
                </pattern>
              </defs>
              <rect x="7" y="7" width="76" height="116" fill={`url(#dp-${i})`} opacity="0.2" />
              <rect x="7" y="7" width="76" height="116" fill="none" stroke="#c9a84c" strokeWidth="0.5" opacity="0.3" />
              <text
                x="45"
                y="67"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="20"
                fill="#c9a84c"
                opacity="0.4"
                fontFamily="serif"
              >
                ♠
              </text>
            </svg>
          </div>
        ))}
      </div>

      {/* ── Title ── */}
      <div className="hero-title">
        <div className="title-stark">STARK</div>
        <div className="title-poker">POKER</div>
      </div>

      <div className="divider" />

      <p className="tagline">No dealer.&nbsp;&nbsp;No server.&nbsp;&nbsp;No trust.</p>

      <Link href="/play" className="play-btn">
        Play Now
      </Link>

      <div className="tech-row">
        <span className="tech-item">Baby Jubjub Encryption</span>
        <span className="tech-sep">·</span>
        <span className="tech-item">Groth16 ZK Proofs</span>
        <span className="tech-sep">·</span>
        <span className="tech-item">On-chain Settlement</span>
      </div>

      <footer className="landing-footer">
        Live on Starknet Sepolia&nbsp;&nbsp;·&nbsp;&nbsp;babyjubjub-starknet
      </footer>
    </div>
  );
}
