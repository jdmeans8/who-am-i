import React, { useEffect, useState, useCallback, useRef } from "react";
import { socket, emit, saveSession, loadSession, clearSession } from "./socket.js";
import Home from "./screens/Home.jsx";
import Lobby from "./screens/Lobby.jsx";
import Game from "./screens/Game.jsx";
import Summary from "./screens/Summary.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const resumedRef = useRef(false);

  const showToast = useCallback((msg) => {
    setToast({ msg, id: Date.now() });
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      // Attempt to rejoin a saved seat once per page load.
      if (!resumedRef.current) {
        resumedRef.current = true;
        const session = loadSession();
        if (session?.code && session?.playerId) {
          emit("resume", session).then((res) => {
            if (!res.ok) {
              clearSession();
              setState(null);
            }
          });
        }
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(next) {
      setState(next);
      if (next?.code && next?.youId) saveSession(next.code, next.youId);
    }
    function onError(msg) {
      showToast(msg);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("errorMsg", onError);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("errorMsg", onError);
    };
  }, [showToast]);

  // Generic action helper — emits, surfaces errors as a toast, returns the ack.
  const action = useCallback(
    async (event, payload = {}) => {
      const res = await emit(event, payload);
      if (!res.ok && res.error) showToast(res.error);
      return res;
    },
    [showToast]
  );

  const leave = useCallback(async () => {
    await emit("leave");
    clearSession();
    setState(null);
  }, []);

  let screen;
  if (!state) {
    screen = <Home action={action} />;
  } else if (state.phase === "lobby") {
    screen = <Lobby state={state} action={action} leave={leave} />;
  } else if (state.phase === "round") {
    screen = <Game state={state} action={action} leave={leave} />;
  } else {
    screen = <Summary state={state} action={action} leave={leave} />;
  }

  return (
    <div className="app">
      {!connected && <div className="conn-banner">Reconnecting…</div>}
      {screen}
      <Toast toast={toast} />
      <footer className="footer">Who Am I? · a party guessing game</footer>
    </div>
  );
}
