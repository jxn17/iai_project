"""
backend/services/ml_service.py

FIXES applied vs uploaded version:
  1. Added MLService class — calamity.py calls ml_svc = MLService(); ml_svc.predict(...)
     The uploaded ml_service.py only had a module-level predict(dict) function, causing
     AttributeError at startup.
  2. Added 'probabilities' key to return dict — CalamityResponse schema requires it.
  3. Added 'description' key to return dict — CalamityResponse schema requires it.
  4. Severity pkl compatibility: the uploaded severity_scaler.pkl was trained with the
     OLD severity_training.py (GradientBoostingRegressor, features=BASE_FEATURES).
     The new inference path detects old vs new bundle format and handles both.
  5. Kept full rule-based fallback so the API works even without pkl files.
"""

import pickle
import os
import logging
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

DATA_DIR        = os.path.join(os.path.dirname(__file__), "..", "data")
CLASSIFIER_PATH = os.path.join(DATA_DIR, "calamity_classifier.pkl")
SEVERITY_PATH   = os.path.join(DATA_DIR, "severity_scaler.pkl")

# Features the classifier was trained on (from train.py)
CLASSIFIER_FEATURES = [
    "magnitude", "depth_km", "lat", "lng",
    "dist_to_coast_km", "central_pressure_hpa",
    "max_wind_knots", "wave_intensity",
]

# Features the OLD severity_scaler.pkl used (from severity_training.py BASE_FEATURES)
OLD_SEVERITY_FEATURES = [
    "depth_km", "lat", "lng",
    "dist_to_coast_km", "max_wind_knots",
]

LEAKY_NAN_FEATURES = [
    "magnitude", "depth_km", "central_pressure_hpa",
    "max_wind_knots", "wave_intensity",
]

_DESCRIPTIONS = {
    "earthquake": {
        "Low":      "Minor earthquake detected. No immediate evacuation required.",
        "Moderate": "Moderate earthquake. Move to open areas, avoid buildings.",
        "High":     "Strong earthquake! Evacuate immediately to the nearest shelter.",
    },
    "tsunami": {
        "Low":      "Tsunami watch issued. Stay alert, move away from coast.",
        "Moderate": "Tsunami warning! Move inland or to high ground immediately.",
        "High":     "Major tsunami imminent! Evacuate coastal areas NOW.",
    },
    "typhoon": {
        "Low":      "Tropical storm approaching. Prepare emergency supplies.",
        "Moderate": "Typhoon warning. Secure your home, prepare to evacuate.",
        "High":     "Super typhoon! Evacuate to designated shelters immediately.",
    },
    "none": {
        "Low": "No active calamity detected. All clear.",
    },
}


def _severity_label(s: float) -> str:
    if s < 0.33:
        return "Low"
    if s < 0.66:
        return "Moderate"
    return "High"


def _make_description(calamity: str, label: str) -> str:
    return _DESCRIPTIONS.get(calamity, {}).get(label, f"{calamity.title()} — {label} severity.")


# ── Rule-based fallback (no pkl needed) ────────────────────────────────────────

def _rule_based_classify(features: dict) -> tuple[str, dict]:
    mag  = float(features.get("magnitude") or 0)
    wave = float(features.get("wave_intensity") or 0)
    pres = float(features.get("central_pressure_hpa") or 1013)
    wind = float(features.get("max_wind_knots") or 0)

    if wave > 0.5:
        probs = {"tsunami": 0.80, "earthquake": 0.15, "typhoon": 0.05}
        return "tsunami", probs
    if mag >= 5.0:
        probs = {"earthquake": 0.78, "tsunami": 0.17, "typhoon": 0.05}
        return "earthquake", probs
    if pres < 990 or wind > 60:
        probs = {"typhoon": 0.78, "earthquake": 0.12, "tsunami": 0.10}
        return "typhoon", probs
    if mag > 0:
        probs = {"earthquake": 0.65, "tsunami": 0.25, "typhoon": 0.10}
        return "earthquake", probs
    probs = {"typhoon": 0.60, "earthquake": 0.25, "tsunami": 0.15}
    return "typhoon", probs


def _rule_based_severity(calamity: str, features: dict) -> float:
    mag  = float(features.get("magnitude") or 0)
    wave = float(features.get("wave_intensity") or 0)
    pres = float(features.get("central_pressure_hpa") or 1013)
    wind = float(features.get("max_wind_knots") or 0)
    if calamity == "earthquake":
        return float(np.clip((mag - 4.5) / 4.5, 0, 1))
    if calamity == "tsunami":
        return float(np.clip(wave / 9.0, 0, 1))
    if calamity == "typhoon":
        p = float(np.clip((1013 - pres) / 133, 0, 1))
        w = float(np.clip(wind / 140, 0, 1))
        return max(p, w)
    return 0.0


# ── MLService class (what calamity.py imports) ─────────────────────────────────

class MLService:
    """
    Singleton-style ML service. Loads pkl files once on first call.
    calamity.py does: ml_svc = MLService(); result = ml_svc.predict(magnitude=...).
    """

    def __init__(self):
        self._clf_bundle = None
        self._sev_bundle = None
        self._clf_loaded = False
        self._sev_loaded = False

    def _load_classifier(self) -> bool:
        if self._clf_loaded:
            return self._clf_bundle is not None
        self._clf_loaded = True
        if not os.path.exists(CLASSIFIER_PATH):
            logger.warning("calamity_classifier.pkl not found — rule-based fallback active")
            return False
        try:
            with open(CLASSIFIER_PATH, "rb") as f:
                self._clf_bundle = pickle.load(f)
            logger.info(f"Classifier loaded. Classes: {self._clf_bundle['encoder'].classes_}")
            return True
        except Exception as e:
            logger.error(f"Failed to load classifier: {e}")
            return False

    def _load_severity(self) -> bool:
        if self._sev_loaded:
            return self._sev_bundle is not None
        self._sev_loaded = True
        if not os.path.exists(SEVERITY_PATH):
            logger.warning("severity_scaler.pkl not found — physics fallback active")
            return False
        try:
            with open(SEVERITY_PATH, "rb") as f:
                self._sev_bundle = pickle.load(f)
            logger.info("Severity model loaded. Features: %s",
                        self._sev_bundle.get("features"))
            return True
        except Exception as e:
            logger.error(f"Failed to load severity model: {e}")
            return False

    def _build_classifier_features(self, raw: dict) -> pd.DataFrame:
        """Build feature row for the XGBoost classifier (matches train.py exactly)."""
        row = {col: raw.get(col, np.nan) for col in CLASSIFIER_FEATURES}
        df = pd.DataFrame([row])
        # Leave NaN as NaN — XGBoost was trained with NaN as the missing signal
        return df[CLASSIFIER_FEATURES]

    def _build_severity_features(self, raw: dict) -> pd.DataFrame:
        """
        Build feature row for severity model.
        Handles both old bundle (BASE_FEATURES) and new bundle (extended features).
        """
        bundle = self._sev_bundle
        feat_list = bundle.get("features", OLD_SEVERITY_FEATURES)
        global_medians = bundle.get("global_medians", {})

        # Build base row with all possible columns
        row = {col: raw.get(col, None) for col in CLASSIFIER_FEATURES}
        df = pd.DataFrame([row])

        # If new bundle: add derived features
        if "pressure_drop" in feat_list:
            pres = float(raw.get("central_pressure_hpa") or 1013)
            depth = float(raw.get("depth_km") or 0)
            wave = raw.get("wave_intensity", None)
            mag = raw.get("magnitude", None)
            dist = float(raw.get("dist_to_coast_km") or 0)

            df["pressure_drop"]    = max(0.0, 1013.0 - pres)
            df["wind_normalized"]  = float(np.clip((raw.get("max_wind_knots") or 0) / 140, 0, 1))
            df["wave_clipped"]     = max(0.0, float(wave or 0))
            df["mag_normalized"]   = float(np.clip((float(mag or 4.5) - 4.5) / 4.6, 0, 1))
            df["depth_factor"]     = 1.0 / (1.0 + depth / 70.0)

            for col in LEAKY_NAN_FEATURES:
                df[f"{col}_missing"] = int(raw.get(col) is None)

        # Fill NaN
        for col in feat_list:
            if col in df.columns and df[col].isna().any():
                fill = global_medians.get(col, 0.0)
                df[col] = df[col].fillna(fill)
            elif col not in df.columns:
                df[col] = 0.0

        return df[feat_list]

    def predict(
        self,
        magnitude: float = None,
        depth_km: float = 10.0,
        lat: float = 38.2,
        lng: float = 140.9,
        central_pressure_hpa: float = None,
        max_wind_knots: float = None,
        wave_intensity: float = None,
        dist_to_coast_km: float = None,
    ) -> dict:
        """
        Main inference method. Accepts keyword args (as calamity.py calls it).
        Returns dict matching CalamityResponse schema.
        """
        features = {
            "magnitude":            magnitude,
            "depth_km":             depth_km,
            "lat":                  lat,
            "lng":                  lng,
            "dist_to_coast_km":     dist_to_coast_km,
            "central_pressure_hpa": central_pressure_hpa,
            "max_wind_knots":       max_wind_knots,
            "wave_intensity":       wave_intensity,
        }

        clf_ok = self._load_classifier()
        sev_ok = self._load_severity()

        # ── Classification ──────────────────────────────────────────────────
        if clf_ok:
            try:
                X = self._build_classifier_features(features)
                proba_arr = self._clf_bundle["model"].predict_proba(X)[0]
                classes   = self._clf_bundle["encoder"].classes_
                idx       = int(np.argmax(proba_arr))
                calamity  = classes[idx]
                probs     = {c: round(float(p), 4) for c, p in zip(classes, proba_arr)}
                confidence = float(proba_arr[idx])
                source    = "ml_model"
            except Exception as e:
                logger.error(f"Classifier inference failed: {e}")
                calamity, probs = _rule_based_classify(features)
                confidence = probs[calamity]
                source = "rule_based"
        else:
            calamity, probs = _rule_based_classify(features)
            confidence = probs[calamity]
            source = "rule_based"

        # ── Severity ────────────────────────────────────────────────────────
        if sev_ok:
            try:
                X_sev = self._build_severity_features(features)
                severity = float(np.clip(
                    self._sev_bundle["model"].predict(X_sev)[0], 0, 1
                ))
            except Exception as e:
                logger.error(f"Severity inference failed: {e}")
                severity = _rule_based_severity(calamity, features)
        else:
            severity = _rule_based_severity(calamity, features)

        label = _severity_label(severity)
        description = _make_description(calamity, label)

        return {
            "calamity":       calamity,
            "severity":       round(severity, 3),
            "severity_label": label.lower(),   # schema expects lowercase
            "source":         source,
            "probabilities":  probs,
            "description":    description,
        }


# ── Module-level predict() for any code that calls predict(dict) directly ──────

_default_svc = None

def predict(features: dict) -> dict:
    """Module-level wrapper — kept for backward compatibility."""
    global _default_svc
    if _default_svc is None:
        _default_svc = MLService()
    return _default_svc.predict(**{
        k: v for k, v in features.items()
        if k in ["magnitude", "depth_km", "lat", "lng",
                 "central_pressure_hpa", "max_wind_knots",
                 "wave_intensity", "dist_to_coast_km"]
    })