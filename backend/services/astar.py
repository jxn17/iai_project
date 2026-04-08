"""
backend/services/astar.py
A* search algorithm + shared graph utilities (haversine, edge weights, adjacency builder).
"""

import heapq
import time
from typing import Dict, List, Tuple, Optional
from math import radians, sin, cos, sqrt, atan2


# ── Haversine distance (meters) ─────────────────────────────────────────────

def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi/2)**2 + cos(phi1) * cos(phi2) * sin(dlambda/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


# ── Edge weight modulation based on calamity + severity ─────────────────────

def compute_edge_weight(edge: dict, calamity: str, severity: float) -> float:
    """
    Returns the effective traversal cost for an edge given current disaster.
    severity ∈ [0.0, 1.0] — output of the ML severity scaler.

    Returns float("inf") for completely blocked edges.
    """
    base = float(edge.get("length", 100))
    highway = edge.get("highway", "")
    if isinstance(highway, list):
        highway = highway[0] if highway else ""
    is_bridge = bool(edge.get("is_bridge", False))

    if calamity == "tsunami":
        if is_bridge:
            return float("inf")
        return base

    elif calamity == "earthquake":
        if is_bridge:
            if severity > 0.5:
                return float("inf")
            return base * (1 + severity * 4)
        slow_factor = 1 + severity * 0.5
        return base * slow_factor

    elif calamity == "typhoon":
        open_highways = {"motorway", "motorway_link", "trunk", "trunk_link", "primary"}
        if any(h in highway for h in open_highways):
            return base * (1 + severity * 2)
        if highway in {"residential", "living_street", "unclassified"}:
            return base * 0.8
        return base

    return base


# ── Build adjacency list from raw graph JSON ─────────────────────────────────

def build_adjacency(
    graph: dict,
    calamity: str,
    severity: float,
    excluded_nodes: Optional[set] = None
) -> Dict[int, List[Tuple[int, float]]]:
    """
    Pre-computes weighted adjacency list.
    excluded_nodes: set of node IDs to skip (e.g. low-elevation nodes in tsunami).
    """
    excluded = excluded_nodes or set()
    adj: Dict[int, List[Tuple[int, float]]] = {}

    for edge in graph["edges"]:
        u, v = int(edge["u"]), int(edge["v"])
        if u in excluded or v in excluded:
            continue
        w = compute_edge_weight(edge, calamity, severity)
        if w == float("inf"):
            continue
        adj.setdefault(u, []).append((v, w))
        adj.setdefault(v, []).append((u, w))

    return adj


# ── A* ───────────────────────────────────────────────────────────────────────

def astar(
    nodes_dict: Dict[int, dict],
    adj: Dict[int, List[Tuple[int, float]]],
    start: int,
    goals: List[int]
) -> dict:
    """
    Returns the shortest path from start to the nearest goal node.
    Uses haversine distance as the admissible heuristic.
    """
    t0 = time.perf_counter()
    nodes_expanded = 0
    best = None

    for goal in goals:
        g_lat = nodes_dict[goal]["lat"]
        g_lng = nodes_dict[goal]["lng"]

        def h(nid: int) -> float:
            n = nodes_dict[nid]
            return haversine_m(n["lat"], n["lng"], g_lat, g_lng)

        open_heap = [(h(start), 0.0, start, [start])]
        g_score: Dict[int, float] = {start: 0.0}

        while open_heap:
            f, g, cur, path = heapq.heappop(open_heap)
            nodes_expanded += 1

            if cur == goal:
                if best is None or g < best["cost"]:
                    best = {"path": path, "cost": g, "goal": goal}
                break

            if g > g_score.get(cur, float("inf")):
                continue

            for nb, w in adj.get(cur, []):
                tg = g + w
                if tg < g_score.get(nb, float("inf")):
                    g_score[nb] = tg
                    heapq.heappush(open_heap, (tg + h(nb), tg, nb, path + [nb]))

    elapsed_ms = (time.perf_counter() - t0) * 1000
    if best is None:
        return {"path": [], "cost": float("inf"),
                "nodes_expanded": nodes_expanded, "time_ms": round(elapsed_ms, 2),
                "algorithm": "astar"}
    return {
        "path": best["path"], "cost": best["cost"], "goal": best["goal"],
        "nodes_expanded": nodes_expanded, "time_ms": round(elapsed_ms, 2),
        "algorithm": "astar"
    }