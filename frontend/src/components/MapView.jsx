import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CENTER = [38.268, 140.87];
const ZOOM = 13;

// Clean circle marker factory
function makeIcon(color, size = 24, border = "#fff") {
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:3px solid ${border};
      box-shadow:0 2px 8px ${color}44, 0 1px 3px rgba(0,0,0,0.15);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: "",
  });
}

const CAMP_COLORS = {
  tsunami_tower: "#0ea5e9",
  school: "#f59e0b",
  community_center: "#8b5cf6",
  gymnasium: "#3b82f6",
  park: "#22c55e",
  hospital: "#ef4444",
};

const userIcon = makeIcon("#4f6ef7", 28);
const destIcon = makeIcon("#22c55e", 26);

export default function MapView({ route, camps, userPos, setUserPos, calamity }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const routeLayer = useRef(null);
  const campMarkers = useRef([]);
  const userMarker = useRef(null);
  const destMarker = useRef(null);

  // Initialize map
  useEffect(() => {
    if (mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: CENTER,
      zoom: ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // OpenStreetMap with international/English labels
    L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e) => {
      setUserPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // User position marker
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (userMarker.current) { map.removeLayer(userMarker.current); userMarker.current = null; }
    if (userPos) {
      userMarker.current = L.marker([userPos.lat, userPos.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.5;">
            <strong style="color:#4f6ef7;">📍 Your Location</strong><br/>
            <span style="color:#5f6577;">${userPos.lat.toFixed(5)}, ${userPos.lng.toFixed(5)}</span>
          </div>
        `);
    }
  }, [userPos]);

  // Camp markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    campMarkers.current.forEach((m) => map.removeLayer(m));
    campMarkers.current = [];

    camps.forEach((camp) => {
      const color = CAMP_COLORS[camp.type] || "#6b7280";
      const marker = L.marker([camp.lat, camp.lng], { icon: makeIcon(color, 20) })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;">
            <strong style="color:#1a1d26;">${camp.name}</strong><br/>
            <span style="color:#5f6577;">
              Type: ${camp.type.replace(/_/g, " ")}<br/>
              Capacity: ${camp.capacity.toLocaleString()}<br/>
              ${camp.elevation_m ? `Elevation: ${camp.elevation_m}m` : ""}
            </span>
          </div>
        `);
      campMarkers.current.push(marker);
    });
  }, [camps]);

  // Route polyline
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (routeLayer.current) { map.removeLayer(routeLayer.current); routeLayer.current = null; }
    if (destMarker.current) { map.removeLayer(destMarker.current); destMarker.current = null; }

    if (route && route.path_coords?.length > 1) {
      const colors = { tsunami: "#0ea5e9", earthquake: "#f97316", typhoon: "#8b5cf6", none: "#4f6ef7" };
      const color = colors[route.calamity] || "#4f6ef7";

      routeLayer.current = L.polyline(route.path_coords, {
        color,
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      const last = route.path_coords[route.path_coords.length - 1];
      destMarker.current = L.marker(last, { icon: destIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;">
            <strong style="color:#22c55e;">🏁 ${route.camp_name}</strong><br/>
            <span style="color:#5f6577;">
              Distance: ${route.distance_km} km<br/>
              Walk time: ~${route.walk_time_minutes} min
            </span>
          </div>
        `)
        .openPopup();

      map.fitBounds(routeLayer.current.getBounds().pad(0.15));
    }
  }, [route]);

  return <div ref={mapRef} className="absolute inset-0 z-0" />;
}
