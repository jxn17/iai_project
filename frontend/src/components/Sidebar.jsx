import { useEffect, useState, useCallback } from "react";
import { getHealth, getCalamity, predictCalamity, getRoute, getCamps } from "../api/client.js";
import CalamityCard from "./CalamityCard.jsx";
import RouteCard from "./RouteCard.jsx";
import AlgoComparison from "./AlgoComparison.jsx";
import ManualSelector from "./ManualSelector.jsx";

// Step indicator
function StepBadge({ num, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
        ${done ? "bg-[var(--color-success)] text-white" :
          active ? "bg-[var(--color-accent)] text-white" :
          "bg-[var(--color-surface)] text-[var(--color-text-muted)]"}`}>
        {done ? "✓" : num}
      </div>
      <span className={`text-sm font-medium ${active || done ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
        {label}
      </span>
    </div>
  );
}

export default function Sidebar({
  calamity, setCalamity, route, setRoute,
  camps, setCamps, userPos,
  loading, setLoading, setError,
  backendOnline, setBackendOnline,
}) {
  const [tab, setTab] = useState("live");
  const [algorithm, setAlgorithm] = useState("astar");

  // Determine which step we're on
  const step = route ? 3 : calamity && calamity.calamity !== "none" ? 2 : 1;

  useEffect(() => {
    getHealth().then(() => setBackendOnline(true)).catch(() => setBackendOnline(false));
  }, []);

  const fetchLive = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCalamity();
      setCalamity(data);
      const campData = await getCamps(data.calamity);
      setCamps(campData.camps || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const handleManualPredict = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await predictCalamity(params);
      setCalamity(data);
      const campData = await getCamps(data.calamity);
      setCamps(campData.camps || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const handleFindRoute = useCallback(async () => {
    if (!userPos) { setError("Click on the map to set your location first."); return; }
    if (!calamity) { setError("Detect a calamity first."); return; }
    setLoading(true);
    try {
      const data = await getRoute({
        lat: userPos.lat, lng: userPos.lng,
        calamity: calamity.calamity, severity: calamity.severity, algorithm,
      });
      setRoute(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [userPos, calamity, algorithm]);

  return (
    <aside className="w-[380px] min-w-[380px] h-full bg-white border-r border-[var(--color-border)]
                       flex flex-col z-10 overflow-hidden shadow-sm">
      {/* ── Header ──────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)] flex items-center justify-center shadow-md">
            <span className="text-white text-lg">🛡️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text)] tracking-tight">
              Evacuation Agent
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] tracking-wide">
              Sendai, Miyagi — AI-Powered Routing
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-surface)]">
          {[
            { key: "live", label: "Live Feed", icon: "🌐" },
            { key: "manual", label: "Manual", icon: "🎛️" }
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200
                ${tab === t.key
                  ? "bg-white text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Progress steps ──────────────────── */}
      <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <StepBadge num={1} label="Detect" active={step === 1} done={step > 1} />
        <div className="flex-1 h-px bg-[var(--color-border)] mx-2" />
        <StepBadge num={2} label="Locate" active={step === 2} done={step > 2} />
        <div className="flex-1 h-px bg-[var(--color-border)] mx-2" />
        <StepBadge num={3} label="Route" active={step === 3} done={false} />
      </div>

      {/* ── Scrollable content ──────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Step 1: Detect calamity */}
        {tab === "live" ? (
          <div className="space-y-3">
            <button
              onClick={fetchLive}
              disabled={loading || backendOnline === false}
              className="w-full py-3 rounded-xl text-base font-semibold transition-all duration-200
                bg-[var(--color-accent)] text-white
                hover:bg-[var(--color-accent-hover)]
                disabled:opacity-40 disabled:cursor-not-allowed
                shadow-sm active:scale-[0.98]"
            >
              {loading && !calamity ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Scanning...
                </span>
              ) : "🔍  Detect Current Calamity"}
            </button>

            {calamity && <CalamityCard data={calamity} />}
          </div>
        ) : (
          <ManualSelector onPredict={handleManualPredict} loading={loading} calamity={calamity} />
        )}

        {/* Step 2: Location + algorithm */}
        {calamity && calamity.calamity !== "none" && (
          <div className="animate-slide-up space-y-3 pt-2 border-t border-[var(--color-border)]">
            {/* Location */}
            <div className="rounded-xl bg-[var(--color-surface)] p-3">
              <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-1">
                📍 Your Location
              </p>
              {userPos ? (
                <p className="text-base text-[var(--color-text)] font-mono">
                  {userPos.lat.toFixed(5)}, {userPos.lng.toFixed(5)}
                </p>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] italic">
                  Click anywhere on the map to set your position
                </p>
              )}
            </div>

            {/* Algorithm selector */}
            <div className="rounded-xl bg-[var(--color-surface)] p-3">
              <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-2">
                ⚡ Search Algorithm
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {["astar", "ucs", "bfs", "dfs"].map((a) => (
                  <button
                    key={a}
                    onClick={() => setAlgorithm(a)}
                    className={`py-2 text-sm font-bold rounded-lg transition-all
                      ${algorithm === a
                        ? "bg-[var(--color-accent)] text-white shadow-sm"
                        : "bg-white text-[var(--color-text-secondary)] hover:bg-white/80 border border-[var(--color-border)]"
                      }`}
                  >
                    {a === "astar" ? "A*" : a.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Route button */}
            <button
              onClick={handleFindRoute}
              disabled={loading || !userPos}
              className="w-full py-3 rounded-xl text-base font-semibold transition-all duration-200
                bg-[var(--color-success)] text-white
                hover:brightness-110
                disabled:opacity-40 disabled:cursor-not-allowed
                shadow-sm active:scale-[0.98]"
            >
              {loading && calamity ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Computing route...
                </span>
              ) : "🚀  Find Evacuation Route"}
            </button>
          </div>
        )}

        {/* Step 3: Results */}
        {route && (
          <div className="animate-slide-up space-y-3 pt-2 border-t border-[var(--color-border)]">
            <RouteCard data={route} />
            <AlgoComparison data={route.algo_comparison} />
          </div>
        )}
      </div>
    </aside>
  );
}
