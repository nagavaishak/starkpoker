"use client";

import { usePokerGame } from "@/lib/usePokerGame";
import { Lobby } from "@/components/Lobby";
import { GameTable } from "@/components/GameTable";

export default function Home() {
  const {
    state,
    address,
    createGame,
    joinGame,
    resumeGame,
    doKeyRegistrationAndShuffle,
    check,
    fold,
    doShowdown,
    pollPhase,
  } = usePokerGame();

  const inGame = state.phase !== "idle";
  const isLoading = state.proofStatus !== null && state.proofStatus !== "done";

  if (!inGame) {
    return (
      <Lobby
        onCreateGame={createGame}
        onJoinGame={joinGame}
        onResumeGame={resumeGame}
        gameId={state.gameId}
        error={state.error}
        isLoading={isLoading}
      />
    );
  }

  return (
    <GameTable
      state={state}
      address={address}
      onCheck={check}
      onFold={fold}
      onDoShuffle={doKeyRegistrationAndShuffle}
      onDoShowdown={doShowdown}
      onPollPhase={pollPhase}
    />
  );
}
