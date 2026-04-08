export default function StatusBar({ backendOnline, calamity, route }) {
  return (
    <div className="absolute bottom-3 left-3 z-[500] flex items-center gap-2">
      {/* Backend status */}
      <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-[var(--color-border)]">
        <span className={`w-2 h-2 rounded-full ${
          backendOnline === true ? "bg-green-500" :
          backendOnline === false ? "bg-red-400" :
          "bg-yellow-400 animate-pulse-soft"
        }`} />
        <span className="text-xs text-[var(--color-text-muted)] font-medium">
          {backendOnline === true ? "API Online" :
           backendOnline === false ? "API Offline" : "Checking..."}
        </span>
      </div>

      {/* Route quick stats */}
      {route && (
        <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-3 shadow-sm border border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-secondary)] font-medium">
            📏 {route.distance_km} km
          </span>
          <span className="text-xs text-[var(--color-text-secondary)] font-medium">
            🚶 {route.walk_time_minutes} min
          </span>
          <span className="text-xs text-[var(--color-text-secondary)] font-medium">
            📍 {route.path_coords?.length || 0} nodes
          </span>
        </div>
      )}
    </div>
  );
}
