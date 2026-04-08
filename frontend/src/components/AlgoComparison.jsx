export default function AlgoComparison({ data }) {
  if (!data || data.length === 0) return null;

  const valid = data.filter((a) => a.cost_meters > 0 && a.path_length > 0);
  const bestCost = valid.length > 0 ? Math.min(...valid.map((a) => a.cost_meters)) : -1;
  const bestTime = valid.length > 0 ? Math.min(...valid.map((a) => a.time_ms)) : -1;

  return (
    <div className="rounded-xl p-4 bg-white border border-[var(--color-border)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📊</span>
        <h3 className="text-base font-bold text-[var(--color-text)]">Algorithm Comparison</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <th className="text-left py-2 font-semibold">Algorithm</th>
              <th className="text-right py-2 font-semibold">Cost (m)</th>
              <th className="text-right py-2 font-semibold">Nodes</th>
              <th className="text-right py-2 font-semibold">Time</th>
              <th className="text-right py-2 font-semibold">Path</th>
            </tr>
          </thead>
          <tbody>
            {data.map((algo) => {
              const isBest = algo.cost_meters === bestCost && algo.cost_meters > 0;
              const isFastest = algo.time_ms === bestTime && algo.time_ms >= 0;
              const noPath = algo.cost_meters <= 0 || algo.path_length === 0;

              return (
                <tr key={algo.algorithm}
                    className={`border-b border-[var(--color-border)]/50 ${noPath ? "opacity-35" : ""}`}>
                  <td className="py-2 font-bold text-[var(--color-text)]">
                    {algo.algorithm === "ASTAR" ? "A*" : algo.algorithm}
                    {isBest && <span className="ml-1 text-green-500 text-[9px]">★</span>}
                  </td>
                  <td className={`py-2 text-right font-mono ${isBest ? "text-green-600 font-bold" : "text-[var(--color-text-secondary)]"}`}>
                    {noPath ? "—" : algo.cost_meters.toLocaleString()}
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--color-text-secondary)]">
                    {algo.nodes_expanded.toLocaleString()}
                  </td>
                  <td className={`py-2 text-right font-mono ${isFastest ? "text-[var(--color-accent)] font-bold" : "text-[var(--color-text-secondary)]"}`}>
                    {algo.time_ms.toFixed(1)}ms
                  </td>
                  <td className="py-2 text-right font-mono text-[var(--color-text-secondary)]">
                    {noPath ? "—" : algo.path_length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
        ★ lowest cost · Blue = fastest time
      </p>
    </div>
  );
}
