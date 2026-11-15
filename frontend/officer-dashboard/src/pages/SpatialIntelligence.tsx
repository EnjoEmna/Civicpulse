import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Crosshair,
  MapPin,
  MagnifyingGlass,
  WarningCircle,
  ArrowsClockwise,
  UsersThree,
  Stack,
  Buildings,
  CheckCircle,
  Clock,
  GlobeHemisphereEast,
} from "@phosphor-icons/react";
import { ExpandableFilterBar, type ActiveFilterChip } from "../components/ExpandableFilterBar";
import { api } from "../api/client";
import type {
  ActiveCitiesResponse,
  GeocodePlaceResult,
  HotspotListResponse,
  PersistedHotspotStatus,
  SpatialAnalysisResult,
  SpatialClusteringResult,
  SpatialComplaint,
  WardAnalyticsResponse,
} from "../types/spatial";
import SpatialMap from "../components/spatial/SpatialMap";

type AnalysisMode = "hotspots" | "clusters" | "nearby" | "wards";

const DEFAULT_LATITUDE = "17.4156";
const DEFAULT_LONGITUDE = "78.4357";

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "ROAD", label: "Roads" },
  { value: "WATER_SUPPLY", label: "Water supply" },
  { value: "ELECTRICITY", label: "Electricity & Streetlights" },
  { value: "SANITATION", label: "Sanitation & Garbage" },
  { value: "PUBLIC_SAFETY", label: "Public safety" },
];

const TIME_WINDOWS = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "border-rose-300 bg-rose-500/15 text-rose-800",
  HIGH: "border-amber-300 bg-amber-500/15 text-amber-800",
  MEDIUM: "border-blue-200 bg-blue-50 text-blue-800",
  LOW: "border-slate-200 bg-slate-100 text-slate-700",
};

function formatCategory(category: string) {
  return String(category || "OTHER")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatus(status: string) {
  return String(status || "")
    .replace(/_/g, " ")
    .toLowerCase();
}

function ComplaintResult({ complaint }: { complaint: SpatialComplaint }) {
  return (
    <article className="rounded-xl border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            to={`/officer/complaints/${complaint.id}`}
            className="font-mono text-[11px] font-bold text-primary hover:underline"
          >
            {complaint.referenceId || complaint.id.slice(0, 8)}
          </Link>
          <h3 className="mt-1 text-sm font-bold text-ink">{complaint.title}</h3>
        </div>

        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold capitalize text-blue-800">
          {formatStatus(complaint.status)}
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        {complaint.address || "Address unavailable"}
        {complaint.ward ? ` · ${complaint.ward}` : ""}
        {complaint.city ? ` · ${complaint.city}` : ""}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-ink-soft">
        <span className="flex items-center gap-1">
          <Stack size={14} />
          {formatCategory(complaint.canonicalCategory)}
        </span>

        <span className="flex items-center gap-1">
          <MapPin size={14} />
          {complaint.distanceMeters.toFixed(1)} m
        </span>

        {complaint.priority && (
          <span className="capitalize">
            Priority: {complaint.priority.toLowerCase()}
          </span>
        )}
      </div>
    </article>
  );
}

export default function SpatialIntelligence() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();

  const initialRouteFocus = useMemo(() => {
    const pCity = searchParams.get("city");
    const pLat = searchParams.get("lat");
    const pLng = searchParams.get("lng");
    const pHotspotId = searchParams.get("hotspotId");
    const pWard = searchParams.get("ward");
    const pRef = searchParams.get("ref");
    const latNum = pLat !== null && pLat !== "" ? Number(pLat) : NaN;
    const lngNum = pLng !== null && pLng !== "" ? Number(pLng) : NaN;
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    return {
      city: pCity || "all",
      lat: hasCoords ? latNum : null,
      lng: hasCoords ? lngNum : null,
      hotspotId: pHotspotId || null,
      ward: pWard || null,
      ref: pRef || null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsKey]);

  const [mode, setMode] = useState<AnalysisMode>("hotspots");

  const [selectedCity, setSelectedCity] = useState<string>(initialRouteFocus.city);
  const [focusedLocation, setFocusedLocation] = useState<{
    latitude: number;
    longitude: number;
    hotspotId?: string | null;
    label?: string | null;
  } | null>(() =>
    initialRouteFocus.lat !== null && initialRouteFocus.lng !== null
      ? {
          latitude: initialRouteFocus.lat,
          longitude: initialRouteFocus.lng,
          hotspotId: initialRouteFocus.hotspotId,
          label:
            [initialRouteFocus.ward, initialRouteFocus.city !== "all" ? initialRouteFocus.city : null]
              .filter(Boolean)
              .join(" · ") || null,
        }
      : null,
  );
  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<GeocodePlaceResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [locating, setLocating] = useState(false);

  const [latitude, setLatitude] = useState(
    initialRouteFocus.lat !== null ? String(initialRouteFocus.lat) : DEFAULT_LATITUDE,
  );
  const [longitude, setLongitude] = useState(
    initialRouteFocus.lng !== null ? String(initialRouteFocus.lng) : DEFAULT_LONGITUDE,
  );
  const [radiusMeters, setRadiusMeters] = useState("5000");
  const [category, setCategory] = useState("all");
  const [timeWindowDays, setTimeWindowDays] = useState("");
  const [cityWideScan, setCityWideScan] = useState(true);

  const [maxResults, setMaxResults] = useState("100");
  const [clusterDistance, setClusterDistance] = useState("150");
  const [minClusterSize, setMinClusterSize] = useState("2");

  const [hotspotFilter, setHotspotFilter] = useState<
    "ALL" | "ACTIVE" | "OVERLAP" | "MONITORING" | "RESOLVED"
  >("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [minHotspotCount, setMinHotspotCount] = useState<number>(0);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [hotspotsData, setHotspotsData] = useState<HotspotListResponse | null>(null);
  const [wardsData, setWardsData] = useState<WardAnalyticsResponse | null>(null);
  const [nearbyResult, setNearbyResult] = useState<SpatialAnalysisResult | null>(null);
  const [clusterResult, setClusterResult] = useState<SpatialClusteringResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [detectingHotspots, setDetectingHotspots] = useState(false);
  const [updatingHotspotId, setUpdatingHotspotId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    if (initialRouteFocus.lat !== null && initialRouteFocus.lng !== null) {
      const placeDesc =
        [initialRouteFocus.ward, initialRouteFocus.city !== "all" ? initialRouteFocus.city : null]
          .filter(Boolean)
          .join(", ") || "selected location";
      const refPart = initialRouteFocus.ref ? ` for #${initialRouteFocus.ref}` : "";
      return `Centered on ${placeDesc}${refPart} (${initialRouteFocus.lat.toFixed(4)}, ${initialRouteFocus.lng.toFixed(4)}).`;
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  async function loadCities() {
    try {
      const data = await api.getSpatialCities();
      setCitiesData(data);
    } catch {
      // keep silent; city pills fall back gracefully to All Cities
    }
  }

  async function loadHotspots(filter = hotspotFilter, city = selectedCity) {
    setLoading(true);
    setError(null);
    try {
      const apiStatus =
        filter === "ACTIVE" || filter === "MONITORING" || filter === "RESOLVED"
          ? filter
          : undefined;
      const data = await api.getHotspots({
        city: city !== "all" ? city : undefined,
        status: apiStatus,
        overlapOnly: filter === "OVERLAP",
        limit: 50,
      });
      setHotspotsData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load persisted hotspots.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadWardAnalytics(
    winDays = timeWindowDays,
    cat = category,
    city = selectedCity,
  ) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWardAnalytics({
        city: city !== "all" ? city : undefined,
        timeWindowDays: winDays ? Number(winDays) : undefined,
        category: cat === "all" ? undefined : cat,
      });
      setWardsData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load ward analytics.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCities();
  }, []);

  useEffect(() => {
    if (!searchParamsKey) return;
    setSelectedCity(initialRouteFocus.city);
    setMode("hotspots");
    if (initialRouteFocus.lat !== null && initialRouteFocus.lng !== null) {
      setLatitude(String(initialRouteFocus.lat));
      setLongitude(String(initialRouteFocus.lng));
      setFocusedLocation({
        latitude: initialRouteFocus.lat,
        longitude: initialRouteFocus.lng,
        hotspotId: initialRouteFocus.hotspotId,
        label:
          [
            initialRouteFocus.ward,
            initialRouteFocus.city !== "all" ? initialRouteFocus.city : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
      });
      const placeDesc =
        [
          initialRouteFocus.ward,
          initialRouteFocus.city !== "all" ? initialRouteFocus.city : null,
        ]
          .filter(Boolean)
          .join(", ") || "selected location";
      const refPart = initialRouteFocus.ref ? ` for #${initialRouteFocus.ref}` : "";
      setNotice(
        `Centered on ${placeDesc}${refPart} (${initialRouteFocus.lat.toFixed(4)}, ${initialRouteFocus.lng.toFixed(4)}).`,
      );
    }
  }, [searchParamsKey, initialRouteFocus]);

  useEffect(() => {
    if (mode === "hotspots") {
      void loadHotspots(hotspotFilter, selectedCity);
    } else if (mode === "wards") {
      void loadWardAnalytics(timeWindowDays, category, selectedCity);
    }
  }, [mode, hotspotFilter, selectedCity]);

  async function runNearbyAt(
    lat: number,
    lng: number,
    rad = Number(radiusMeters) || 5000,
    cityOverride = selectedCity,
  ) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.analyzeSpatialArea({
        latitude: lat,
        longitude: lng,
        radiusMeters: rad,
        maxResults: Number(maxResults) || 100,
        category: category === "all" ? undefined : category,
        timeWindowDays: timeWindowDays ? Number(timeWindowDays) : undefined,
        city: cityOverride !== "all" ? cityOverride : undefined,
      });
      setNearbyResult(response.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete nearby spatial query.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectCity(
    cityName: string,
    center?: { latitude: number; longitude: number } | null,
  ) {
    setSelectedCity(cityName);
    setFocusedLocation(null);
    setNotice(null);
    setError(null);
    setPlaceResults([]);
    if (searchParamsKey) {
      setSearchParams({}, { replace: true });
    }

    if (center) {
      setLatitude(String(center.latitude));
      setLongitude(String(center.longitude));
    }

    if (mode === "clusters" && cityWideScan) {
      setLoading(true);
      try {
        const res = await api.analyzeSpatialClusters({
          cityWide: true,
          city: cityName !== "all" ? cityName : undefined,
          clusterDistanceMeters: Number(clusterDistance) || 150,
          minClusterSize: Number(minClusterSize) || 2,
          category: category === "all" ? undefined : category,
          timeWindowDays: timeWindowDays ? Number(timeWindowDays) : undefined,
        });
        setClusterResult(res.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load city clusters.",
        );
      } finally {
        setLoading(false);
      }
    } else if (mode === "nearby" && center) {
      await runNearbyAt(center.latitude, center.longitude, Number(radiusMeters) || 10000, cityName);
    }
  }

  async function handlePlaceSearch(e: FormEvent) {
    e.preventDefault();
    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }
    setSearchingPlace(true);
    setError(null);
    try {
      const res = await api.geocodePlace(placeQuery.trim());
      setPlaceResults(res.results || []);
      if (!res.results || res.results.length === 0) {
        setNotice(`No matching cities or localities found for "${placeQuery.trim()}".`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Place search failed.",
      );
    } finally {
      setSearchingPlace(false);
    }
  }

  async function handlePickPlace(place: GeocodePlaceResult) {
    setPlaceQuery(place.label);
    setPlaceResults([]);
    setLatitude(String(place.latitude));
    setLongitude(String(place.longitude));
    setFocusedLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.label,
    });
    setError(null);
    if (searchParamsKey) {
      setSearchParams({}, { replace: true });
    }

    const matchedActive = citiesData?.cities.find(
      (c) => c.city.toLowerCase() === String(place.city || "").toLowerCase(),
    );

    if (matchedActive && (mode === "hotspots" || mode === "wards")) {
      setSelectedCity(matchedActive.city);
      setNotice(`Filtered view to ${matchedActive.city} (${place.label}).`);
      return;
    }

    setSelectedCity(matchedActive ? matchedActive.city : "all");
    if (mode === "hotspots" || mode === "wards") {
      setMode("nearby");
      setRadiusMeters("10000");
      setNotice(`Centered nearby scan on ${place.label}.`);
      await runNearbyAt(place.latitude, place.longitude, 10000, "all");
    } else if (mode === "clusters") {
      setCityWideScan(false);
      setNotice(`Centered cluster scan on ${place.label}.`);
    } else {
      setNotice(`Centered nearby scan on ${place.label}.`);
      await runNearbyAt(place.latitude, place.longitude, Number(radiusMeters) || 10000, "all");
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Browser geolocation is not available.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(String(lat));
        setLongitude(String(lng));
        setSelectedCity("all");
        setFocusedLocation({
          latitude: lat,
          longitude: lng,
          label: "Your GPS location",
        });
        if (searchParamsKey) {
          setSearchParams({}, { replace: true });
        }
        setLocating(false);
        setNotice(`Centered on your GPS location (${lat}, ${lng}).`);
        if (mode === "nearby") {
          await runNearbyAt(lat, lng, Number(radiusMeters) || 5000, "all");
        } else if (mode === "hotspots" || mode === "wards") {
          setMode("nearby");
          await runNearbyAt(lat, lng, Number(radiusMeters) || 5000, "all");
        } else {
          setCityWideScan(false);
        }
      },
      () => {
        setLocating(false);
        setError("Could not access browser GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function handleDetectHotspots() {
    setDetectingHotspots(true);
    setError(null);
    setNotice(null);

    try {
      const res = await api.detectHotspots({
        cityWide: true,
        city: selectedCity !== "all" ? selectedCity : undefined,
        clusterDistanceMeters: Number(clusterDistance) || 150,
        minClusterSize: Number(minClusterSize) || 2,
        timeWindowDays: timeWindowDays ? Number(timeWindowDays) : null,
        category: category === "all" ? undefined : category,
      });

      setNotice(
        `Hotspot scan complete${selectedCity !== "all" ? ` for ${selectedCity}` : " across all cities"}: ${res.detectedCount} cluster(s) detected and persisted (${res.crossCategoryOverlapCount} cross-category overlap alert${res.crossCategoryOverlapCount === 1 ? "" : "s"}).`,
      );
      await Promise.all([
        loadHotspots(hotspotFilter, selectedCity),
        loadCities(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to run hotspot detection.",
      );
    } finally {
      setDetectingHotspots(false);
    }
  }

  async function handleHotspotStatusChange(
    hotspotId: string,
    nextStatus: PersistedHotspotStatus,
  ) {
    setUpdatingHotspotId(hotspotId);
    setError(null);

    try {
      await api.updateHotspotStatus(hotspotId, nextStatus);
      await loadHotspots(hotspotFilter);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update hotspot status.",
      );
    } finally {
      setUpdatingHotspotId(null);
    }
  }

  async function handleAnalyze() {
    if (mode === "hotspots") {
      await handleDetectHotspots();
      return;
    }

    if (mode === "wards") {
      await loadWardAnalytics(timeWindowDays, category);
      return;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const radius = Number(radiusMeters);

    if (
      (!cityWideScan || mode === "nearby") &&
      (latitude.trim() === "" ||
        longitude.trim() === "" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !Number.isInteger(radius) ||
        radius < (mode === "nearby" ? 50 : 100) ||
        radius > 50000 ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180)
    ) {
      setError("Enter valid coordinates and a radius within the allowed range.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const selectedCategory = category === "all" ? undefined : category;
      const winDays = timeWindowDays ? Number(timeWindowDays) : undefined;

      if (mode === "nearby") {
        const response = await api.analyzeSpatialArea({
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          maxResults: Number(maxResults),
          category: selectedCategory,
          timeWindowDays: winDays,
          city: selectedCity !== "all" ? selectedCity : undefined,
        });

        setNearbyResult(response.data);
      } else {
        const response = await api.analyzeSpatialClusters({
          ...(cityWideScan
            ? { cityWide: true, city: selectedCity !== "all" ? selectedCity : undefined }
            : { latitude: lat, longitude: lng, radiusMeters: radius, cityWide: false }),
          clusterDistanceMeters: Number(clusterDistance),
          minClusterSize: Number(minClusterSize),
          category: selectedCategory,
          timeWindowDays: winDays,
        });

        setClusterResult(response.data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete spatial analysis.",
      );
    } finally {
      setLoading(false);
    }
  }

  const activeNearby = mode === "nearby" ? nearbyResult : null;
  const activeClusters = mode === "clusters" ? clusterResult : null;
  const filteredHotspots = useMemo(() => {
    if (!hotspotsData) return [];
    return hotspotsData.hotspots.filter((h) => {
      if (severityFilter !== "all" && h.severity.toUpperCase() !== severityFilter) {
        return false;
      }
      if (minHotspotCount > 0 && h.complaintCount < minHotspotCount) {
        return false;
      }
      if (
        category !== "all" &&
        !(h.overlapCategories || []).includes(category) &&
        !(h.issueCategories || []).includes(category) &&
        h.dominantCategory !== category
      ) {
        return false;
      }
      return true;
    });
  }, [hotspotsData, severityFilter, minHotspotCount, category]);

  const activeHotspots =
    mode === "hotspots" && hotspotsData
      ? { ...hotspotsData, hotspots: filteredHotspots }
      : null;
  const activeWards = mode === "wards" ? wardsData : null;

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (selectedCity !== "all") {
      chips.push({
        key: "city",
        label: `City: ${selectedCity}`,
        onRemove: () => void handleSelectCity("all", null),
      });
    }
    if (hotspotFilter !== "ALL") {
      const hLbl =
        hotspotFilter === "ACTIVE"
          ? "Active Only"
          : hotspotFilter === "OVERLAP"
            ? "Overlap Alerts"
            : hotspotFilter;
      chips.push({
        key: "hotspotScope",
        label: `Hotspots: ${hLbl}`,
        onRemove: () => setHotspotFilter("ALL"),
      });
    }
    if (severityFilter !== "all") {
      chips.push({
        key: "severity",
        label: `Severity: ${severityFilter}`,
        onRemove: () => setSeverityFilter("all"),
      });
    }
    if (category !== "all") {
      chips.push({
        key: "cat",
        label: `Category: ${CATEGORIES.find((c) => c.value === category)?.label || category}`,
        onRemove: () => setCategory("all"),
      });
    }
    if (timeWindowDays) {
      chips.push({
        key: "time",
        label: `Last ${timeWindowDays}d`,
        onRemove: () => setTimeWindowDays(""),
      });
    }
    if (minHotspotCount > 0) {
      chips.push({
        key: "minCount",
        label: `≥ ${minHotspotCount} Reports`,
        onRemove: () => setMinHotspotCount(0),
      });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, hotspotFilter, severityFilter, category, timeWindowDays, minHotspotCount]);

  function handleResetSpatialFilters() {
    setHotspotFilter("ALL");
    setSeverityFilter("all");
    setCategory("all");
    setTimeWindowDays("");
    setMinHotspotCount(0);
    if (selectedCity !== "all") {
      void handleSelectCity("all", null);
    }
  }

  const fallbackCenter = {
    latitude: Number(latitude) || 17.4156,
    longitude: Number(longitude) || 78.4357,
  };

  const mapCenter = activeNearby
    ? activeNearby.center
    : activeClusters?.center
      ? activeClusters.center
      : fallbackCenter;

  const mapRadius = activeNearby
    ? activeNearby.radiusMeters
    : activeClusters?.radiusMeters
      ? activeClusters.radiusMeters
      : Number(radiusMeters) || 5000;

  const showSearchCircle =
    mode === "nearby" || (mode === "clusters" && !cityWideScan);

  const mapComplaints = activeNearby ? activeNearby.complaints : [];
  const mapClusters = activeClusters
    ? activeClusters.clusters
    : activeHotspots
      ? activeHotspots.hotspots
      : undefined;

  const wardMarkers = activeWards
    ? activeWards.wards
        .filter((w) => w.center != null)
        .map((w) => ({
          city: w.city ?? null,
          ward: w.ward,
          zone: w.zone,
          totalComplaints: w.totalComplaints,
          openComplaints: w.openComplaints,
          densityPerSqKm: w.densityPerSqKm,
          activeHotspots: w.activeHotspots,
          overlapHotspots: w.overlapHotspots,
          center: w.center!,
        }))
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
            <Crosshair size={13} weight="bold" />
            Hotspot &amp; Geographic Density Analytics
          </span>

          <h1 className="pt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Spatial Intelligence &amp; Hotspots
          </h1>

          <p className="text-sm font-medium text-ink-soft">
            Persisted infrastructure hotspots, cross-category overlap alerts, DBSCAN clustering, and ward density analytics.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleDetectHotspots()}
          disabled={detectingHotspots}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-primary-strong disabled:opacity-60 cursor-pointer sm:self-auto"
        >
          <ArrowsClockwise size={15} className={detectingHotspots ? "animate-spin" : ""} />
          {detectingHotspots
            ? "Scanning..."
            : selectedCity !== "all"
              ? `Detect Hotspots (${selectedCity})`
              : "Detect & Refresh Hotspots"}
        </button>
      </div>

      {/* Clean Compact Jurisdiction + Search + Expandable Filter Drawer */}
      <ExpandableFilterBar
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen((prev) => !prev)}
        activeCount={activeFilterChips.length}
        chips={activeFilterChips}
        onResetAll={handleResetSpatialFilters}
        panelTitle="Spatial Jurisdiction, Hotspot & Category Filters"
        leading={
          <div className="relative flex flex-1 flex-wrap items-center gap-2 min-w-[240px]">
            <form onSubmit={(e) => void handlePlaceSearch(e)} className="flex flex-1 items-center gap-1.5 max-w-sm">
              <div className="relative flex-1">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                />
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder="Jump to city, town, or ward..."
                  aria-label="Search city or place"
                  className="glass-input w-full py-2 pl-8 pr-3 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={searchingPlace}
                className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60 cursor-pointer"
              >
                {searchingPlace ? "Finding..." : "Go"}
              </button>
            </form>

            {placeResults.length > 0 && (
              <div className="absolute left-0 top-11 z-[1100] w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  <span>Matching Places</span>
                  <button
                    type="button"
                    onClick={() => setPlaceResults([])}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
                  {placeResults.map((place, idx) => (
                    <li key={`${place.label}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => void handlePickPlace(place)}
                        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50/70 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate">{place.label}</p>
                          <p className="text-[10px] text-ink-soft">
                            {place.city} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {place.source === "active-complaints" ? "Active DB" : place.source}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        }
        trailing={
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/75 bg-white/75 px-3 py-2 text-xs font-bold text-primary hover:bg-white cursor-pointer disabled:opacity-60"
          >
            <Crosshair size={14} weight="bold" />
            {locating ? "Locating..." : "Use My Location"}
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {/* Jurisdiction */}
          <div className="flex flex-col gap-1.5">
            <label className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              <GlobeHemisphereEast size={13} className="text-primary" />
              Jurisdiction (City)
            </label>
            <select
              value={selectedCity}
              onChange={(e) => {
                const cName = e.target.value;
                const found = (citiesData?.cities || []).find((c) => c.city === cName);
                void handleSelectCity(cName, found?.center ?? null);
              }}
              aria-label="Filter spatial data by city"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="all">All Cities</option>
              {(citiesData?.cities || []).map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.complaintCount})
                </option>
              ))}
            </select>
          </div>

          {/* Hotspot Scope */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Hotspot Scope
            </label>
            <select
              value={hotspotFilter}
              onChange={(e) =>
                setHotspotFilter(
                  e.target.value as "ALL" | "ACTIVE" | "OVERLAP" | "MONITORING" | "RESOLVED",
                )
              }
              aria-label="Filter hotspots by status or overlap"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="ALL">All Hotspots</option>
              <option value="ACTIVE">Active Only</option>
              <option value="OVERLAP">Cross-Category Overlaps</option>
              <option value="MONITORING">Monitoring</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          {/* Hotspot Severity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Hotspot Severity
            </label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filter hotspots by severity"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Complaint Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Complaints */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Min Cluster Reports
            </label>
            <select
              value={String(minHotspotCount)}
              onChange={(e) => setMinHotspotCount(Number(e.target.value))}
              aria-label="Filter hotspots by minimum complaint count"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="0">Any Size</option>
              <option value="2">≥ 2 Complaints</option>
              <option value="3">≥ 3 Complaints</option>
              <option value="5">≥ 5 Complaints</option>
            </select>
          </div>
        </div>
      </ExpandableFilterBar>

      {/* Analysis mode selector */}
      <div className="glass-panel grid grid-cols-2 gap-2 p-2 lg:grid-cols-4">
        {[
          {
            key: "hotspots" as const,
            title: "Persisted Hotspots",
            subtitle: "Saved zones & overlap alerts",
            icon: UsersThree,
          },
          {
            key: "clusters" as const,
            title: "Spatial Clusters",
            subtitle: "Run custom DBSCAN analysis",
            icon: Crosshair,
          },
          {
            key: "nearby" as const,
            title: "Nearby Search",
            subtitle: "Radius density & breakdown",
            icon: MagnifyingGlass,
          },
          {
            key: "wards" as const,
            title: "Ward & Zone Analytics",
            subtitle: "Ward density & backlog",
            icon: Buildings,
          },
        ].map(({ key, title, subtitle, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setError(null);
              }}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition cursor-pointer ${
                active
                  ? "bg-primary text-white shadow-md"
                  : "text-ink-soft hover:bg-white/60"
              }`}
            >
              <Icon size={20} weight="duotone" className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{title}</span>
                <span
                  className={`block truncate text-[11px] ${
                    active ? "text-white/80" : "text-ink-soft"
                  }`}
                >
                  {subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/70 bg-emerald-500/15 px-4 py-3 text-xs font-semibold text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle size={17} weight="fill" className="shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </div>
          {focusedLocation && (
            <button
              type="button"
              onClick={() => {
                setFocusedLocation(null);
                setNotice(null);
                if (searchParamsKey) {
                  setSearchParams({}, { replace: true });
                }
              }}
              className="rounded-lg border border-emerald-400/60 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-white cursor-pointer"
            >
              Reset Focus
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"
        >
          <WarningCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Spatial request failed</p>
            <p className="mt-1 text-xs leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Search / Parameter Configuration (shown cleanly for Clusters, Nearby, and Wards, or collapsible scan tuning) */}
      {mode !== "hotspots" && (
        <section className="glass-panel p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Crosshair size={18} className="text-primary" weight="duotone" />
              <div>
                <h2 className="text-sm font-bold text-ink">Analysis Parameters</h2>
                <p className="text-xs text-ink-soft">
                  Configure geographic bounds, time window, and category filters.
                </p>
              </div>
            </div>

            {mode === "clusters" && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                <input
                  type="checkbox"
                  checked={cityWideScan}
                  onChange={(e) => setCityWideScan(e.target.checked)}
                  className="rounded border-indigo-300 text-primary"
                />
                {selectedCity === "all"
                  ? "Multi-city full scan"
                  : `Full ${selectedCity} cluster scan`}
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(mode === "nearby" || (mode === "clusters" && !cityWideScan)) && (
              <>
                <Field label="Latitude">
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="glass-input w-full px-3 py-2.5 text-sm"
                  />
                </Field>

                <Field label="Longitude">
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="glass-input w-full px-3 py-2.5 text-sm"
                  />
                </Field>

                <Field label="Search radius (metres)">
                  <input
                    type="number"
                    min={mode === "nearby" ? 50 : 100}
                    max={50000}
                    step="1"
                    value={radiusMeters}
                    onChange={(e) => setRadiusMeters(e.target.value)}
                    className="glass-input w-full px-3 py-2.5 text-sm"
                  />
                </Field>
              </>
            )}

            <Field label="Complaint category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-sm"
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Time window">
              <select
                value={timeWindowDays}
                onChange={(e) => setTimeWindowDays(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-sm"
              >
                {TIME_WINDOWS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            {mode === "nearby" && (
              <Field label="Maximum results">
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                />
              </Field>
            )}

            {mode === "clusters" && (
              <>
                <Field label="Cluster distance (metres)">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    step="1"
                    value={clusterDistance}
                    onChange={(e) => setClusterDistance(e.target.value)}
                    className="glass-input w-full px-3 py-2.5 text-sm"
                  />
                </Field>

                <Field label="Minimum complaints per cluster">
                  <input
                    type="number"
                    min="2"
                    max="100"
                    step="1"
                    value={minClusterSize}
                    onChange={(e) => setMinClusterSize(e.target.value)}
                    className="glass-input w-full px-3 py-2.5 text-sm"
                  />
                </Field>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-ink-soft">
              {mode === "nearby"
                ? "Computes proximity density, ward breakdown, and cross-category overlap alerts."
                : mode === "clusters"
                  ? "Detects connected spatial hotspots, recurrence score, severity, and infrastructure overlaps."
                  : "Aggregates complaint volume, open backlog, density/km², and active hotspots per municipal ward."}
            </p>

            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={loading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <ArrowsClockwise size={15} className="animate-spin" />
              ) : (
                <MagnifyingGlass size={15} weight="bold" />
              )}
              {loading
                ? "Analyzing..."
                : mode === "wards"
                  ? "Refresh Ward Analytics"
                  : "Run Analysis"}
            </button>
          </div>
        </section>
      )}

      {/* Interactive Geographic Map */}
      {(activeHotspots || activeClusters || activeNearby || activeWards) && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ResultHeading
              title="Geographic Distribution"
              description={
                mode === "hotspots"
                  ? "Persisted hotspots across municipal wards. Amber/Red circles indicate multi-category infrastructure overlaps."
                  : mode === "wards"
                    ? "Municipal ward centroids sized by complaint density and active overlap status."
                    : mode === "clusters"
                      ? "Detected DBSCAN hotspots with spatial footprint radius."
                      : "Individual complaints within the selected search radius."
              }
            />
          </div>

          <SpatialMap
            center={mapCenter}
            radiusMeters={mapRadius}
            showSearchCircle={showSearchCircle}
            complaints={mapComplaints}
            clusters={mapClusters}
            wardMarkers={wardMarkers}
            focusedLocation={focusedLocation}
            onCenterSelect={
              mode === "nearby" || (mode === "clusters" && !cityWideScan)
                ? (coords) => {
                    setLatitude(String(coords.latitude));
                    setLongitude(String(coords.longitude));
                    setFocusedLocation({
                      latitude: coords.latitude,
                      longitude: coords.longitude,
                      label: "Selected Scan Center",
                    });
                    setNotice(
                      `Scan center updated to ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}. Click Run Analysis to refresh.`,
                    );
                  }
                : undefined
            }
          />
        </section>
      )}

      {/* MODE 1: Persisted Hotspots */}
      {mode === "hotspots" && (
        <section className="flex flex-col gap-4">
          {activeHotspots && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Persisted Hotspots" value={activeHotspots.total} />
                <Metric label="Active Hotspots" value={activeHotspots.activeCount} />
                <Metric
                  label="Cross-Category Overlaps"
                  value={activeHotspots.crossCategoryOverlapCount}
                  highlight={activeHotspots.crossCategoryOverlapCount > 0}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Showing {activeHotspots.hotspots.length} hotspot
                  {activeHotspots.hotspots.length === 1 ? "" : "s"}
                </p>
              </div>

              {activeHotspots.hotspots.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {[...activeHotspots.hotspots]
                    .sort((a, b) => {
                      const af = focusedLocation?.hotspotId === a.id ? 1 : 0;
                      const bf = focusedLocation?.hotspotId === b.id ? 1 : 0;
                      return bf - af;
                    })
                    .map((hotspot) => {
                      const isFocusedHotspot = focusedLocation?.hotspotId === hotspot.id;
                      return (
                        <article
                          key={hotspot.id}
                          className={`glass-panel flex flex-col gap-4 p-5 ${
                            isFocusedHotspot
                              ? "border-2 border-primary/70 ring-2 ring-primary/20"
                              : hotspot.hasCrossCategoryOverlap
                                ? "border border-amber-300/80"
                                : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                {isFocusedHotspot && (
                                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                                    In Focus
                                  </span>
                                )}
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                                    SEVERITY_BADGE[hotspot.severity] || SEVERITY_BADGE.MEDIUM
                                  }`}
                                >
                                  {hotspot.severity} Severity
                                </span>
                                {hotspot.hasCrossCategoryOverlap && (
                                  <span className="rounded-full border border-amber-300 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                                    Cross-Category Overlap
                                  </span>
                                )}
                                {(hotspot.city || hotspot.ward) && (
                                  <span className="text-[11px] font-semibold text-ink-soft">
                                    {hotspot.city ? `${hotspot.city} · ` : ""}
                                    {hotspot.ward}
                                    {hotspot.zone ? ` · ${hotspot.zone}` : ""}
                                  </span>
                                )}
                              </div>
                              <h3 className="mt-1.5 text-lg font-extrabold text-ink">
                                {hotspot.title}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setFocusedLocation({
                                    latitude: hotspot.centroid.latitude,
                                    longitude: hotspot.centroid.longitude,
                                    hotspotId: hotspot.id,
                                    label: hotspot.title,
                                  })
                                }
                                className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                              >
                                Center Map
                              </button>
                              <label className="text-[11px] font-semibold text-ink-soft">
                                Status:
                                <select
                                  aria-label={`Status for ${hotspot.title}`}
                                  value={hotspot.status}
                                  disabled={updatingHotspotId === hotspot.id}
                                  onChange={(e) =>
                                    void handleHotspotStatusChange(
                                      hotspot.id,
                                      e.target.value as PersistedHotspotStatus,
                                    )
                                  }
                                  className="glass-input ml-2 px-2.5 py-1 text-xs font-bold text-ink"
                                >
                                  <option value="ACTIVE">ACTIVE</option>
                                  <option value="MONITORING">MONITORING</option>
                                  <option value="RESOLVED">RESOLVED</option>
                                </select>
                              </label>
                            </div>
                          </div>

                      {hotspot.hasCrossCategoryOverlap && hotspot.overlapSummary && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950">
                          <WarningCircle
                            size={17}
                            weight="fill"
                            className="mt-0.5 shrink-0 text-amber-600"
                          />
                          <div>
                            <strong className="block font-bold">
                              Overlapping Categories:{" "}
                              {hotspot.overlapCategories.map(formatCategory).join(" + ")}
                            </strong>
                            <p className="mt-0.5 leading-relaxed">
                              {hotspot.overlapSummary}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-3 rounded-xl bg-white/50 p-3 text-xs sm:grid-cols-5">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Complaints
                          </p>
                          <p className="mt-1 font-mono text-sm font-bold text-ink">
                            {hotspot.complaintCount}{" "}
                            <span className="text-[11px] font-medium text-ink-soft">
                              ({hotspot.openCount} open)
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Footprint Radius
                          </p>
                          <p className="mt-1 font-mono text-sm font-bold text-ink">
                            {Math.round(hotspot.radiusMeters)} m
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Density
                          </p>
                          <p className="mt-1 font-mono text-sm font-bold text-ink">
                            {hotspot.densityPerSqKm} / km²
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Recurrence Score
                          </p>
                          <p className="mt-1 font-mono text-sm font-bold text-ink">
                            {Math.round(hotspot.recurrenceScore * 100)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Confidence
                          </p>
                          <p className="mt-1 font-mono text-sm font-bold text-indigo-700">
                            {Math.round(hotspot.confidence * 100)}%
                          </p>
                        </div>
                      </div>

                      <CategoryCounts counts={hotspot.categoryCounts} />

                      {hotspot.complaints.length > 0 && (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {hotspot.complaints.map((complaint) => (
                            <ComplaintResult key={complaint.id} complaint={complaint} />
                          ))}
                        </div>
                      )}
                        </article>
                      );
                    })}
                </div>
              ) : (
                <EmptyState message="No persisted hotspots match this filter yet. Click 'Detect & Refresh Hotspots' above to scan all geocoded complaints." />
              )}
            </>
          )}
        </section>
      )}

      {/* MODE 2: Spatial Clusters */}
      {activeClusters && (
        <section className="flex flex-col gap-4">
          <ResultHeading
            title="Spatial Cluster Scan"
            description={`${activeClusters.clusterCount} cluster(s) identified from ${activeClusters.totalComplaintsAnalyzed} complaints.`}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Clusters identified" value={activeClusters.clusterCount} />
            <Metric
              label="Complaints analyzed"
              value={activeClusters.totalComplaintsAnalyzed}
            />
            <Metric
              label="Clustered complaints"
              value={activeClusters.clusteredComplaintCount}
            />
            <Metric
              label="Cross-category overlaps"
              value={activeClusters.crossCategoryOverlapCount}
              highlight={activeClusters.crossCategoryOverlapCount > 0}
            />
          </div>

          {activeClusters.clusters.length > 0 ? (
            <div className="flex flex-col gap-4">
              {activeClusters.clusters.map((cluster, index) => (
                <article
                  key={cluster.clusterId}
                  className="glass-panel flex flex-col gap-4 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Cluster {index + 1} · {cluster.city ? `${cluster.city} · ` : ""}{cluster.ward || "Jurisdiction"}
                      </p>
                      <h3 className="mt-1 text-lg font-extrabold text-ink">
                        {cluster.title} ({cluster.complaintCount} complaints)
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                          SEVERITY_BADGE[cluster.severity] || SEVERITY_BADGE.MEDIUM
                        }`}
                      >
                        {cluster.severity}
                      </span>
                      {cluster.hasCrossCategoryOverlap && (
                        <span className="rounded-full border border-amber-300 bg-amber-500/20 px-3 py-1 text-[11px] font-bold text-amber-900">
                          Overlap
                        </span>
                      )}
                    </div>
                  </div>

                  {cluster.hasCrossCategoryOverlap && cluster.overlapSummary && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950">
                      {cluster.overlapSummary}
                    </div>
                  )}

                  <div className="grid gap-3 rounded-xl bg-white/50 p-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-ink-soft">
                        Centroid
                      </p>
                      <p className="mt-1 font-mono text-xs font-semibold text-ink">
                        {cluster.centroid.latitude.toFixed(5)},{" "}
                        {cluster.centroid.longitude.toFixed(5)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-ink-soft">
                        Footprint Radius
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-ink">
                        {cluster.radiusMeters} m
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-ink-soft">
                        Recurrence
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-ink">
                        {Math.round(cluster.recurrenceScore * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-ink-soft">
                        Confidence
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-indigo-700">
                        {Math.round(cluster.confidence * 100)}%
                      </p>
                    </div>
                  </div>

                  <CategoryCounts counts={cluster.categoryCounts} />

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {cluster.complaints.map((complaint) => (
                      <ComplaintResult key={complaint.id} complaint={complaint} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No clusters met the selected minimum cluster size. Try increasing cluster distance or using City-Wide Scan." />
          )}
        </section>
      )}

      {/* MODE 3: Nearby Complaints */}
      {activeNearby && (
        <section className="flex flex-col gap-4">
          <ResultHeading
            title="Nearby Complaints"
            description={`${activeNearby.returnedCount} complaint(s) returned within ${activeNearby.radiusMeters} metres.`}
          />

          {activeNearby.hasCrossCategoryOverlap && activeNearby.overlapAlert && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 text-xs font-medium text-amber-950">
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
              <span>{activeNearby.overlapAlert}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Complaints returned" value={activeNearby.returnedCount} />
            <Metric label="Open complaints" value={activeNearby.openCount} />
            <Metric
              label="Area density"
              value={`${activeNearby.densityPerSqKm} / km²`}
            />
            <Metric
              label="Categories found"
              value={Object.keys(activeNearby.categoryCounts).length}
            />
          </div>

          <CategoryCounts counts={activeNearby.categoryCounts} />

          {activeNearby.cityBreakdown &&
            Object.keys(activeNearby.cityBreakdown).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-ink-soft">Cities:</span>
                {Object.entries(activeNearby.cityBreakdown).map(([cityName, count]) => (
                  <span
                    key={cityName}
                    className="rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold text-blue-800"
                  >
                    {cityName} · {count}
                  </span>
                ))}
              </div>
            )}

          {Object.keys(activeNearby.wardBreakdown).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-ink-soft">Wards:</span>
              {Object.entries(activeNearby.wardBreakdown).map(([wardName, count]) => (
                <span
                  key={wardName}
                  className="rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1 text-[11px] font-semibold text-indigo-800"
                >
                  {wardName} · {count}
                </span>
              ))}
            </div>
          )}

          {activeNearby.complaints.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {activeNearby.complaints.map((complaint) => (
                <ComplaintResult key={complaint.id} complaint={complaint} />
              ))}
            </div>
          ) : (
            <EmptyState message="No complaints were found in this area." />
          )}
        </section>
      )}

      {/* MODE 4: Ward & Zone Analytics */}
      {mode === "wards" && activeWards && (
        <section className="flex flex-col gap-4">
          <ResultHeading
            title="Ward & Zone Distribution"
            description={`${activeWards.totalWards} active municipal jurisdiction ward(s) across ${activeWards.totalComplaints} tracked complaints.`}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Wards Tracked" value={activeWards.totalWards} />
            <Metric label="Total Complaints" value={activeWards.totalComplaints} />
            <Metric
              label="Highest Ward Density"
              value={
                activeWards.wards[0]
                  ? `${activeWards.wards[0].densityPerSqKm} / km²`
                  : "0 / km²"
              }
            />
          </div>

          {activeWards.wards.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {activeWards.wards.map((wardItem) => (
                <article
                  key={`${wardItem.city || "gen"}-${wardItem.ward}`}
                  className="glass-panel flex flex-col gap-3 p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        {wardItem.city ? `${wardItem.city} · ` : ""}
                        {wardItem.zone} · {wardItem.areaSqKm} km²
                      </span>
                      <h3 className="mt-0.5 text-base font-extrabold text-ink">
                        {wardItem.ward}
                      </h3>
                    </div>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-xs font-bold text-indigo-800">
                      {wardItem.densityPerSqKm} / km²
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/55 p-3 text-center text-xs">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-ink-soft">
                        Total
                      </span>
                      <span className="font-mono text-base font-extrabold text-ink">
                        {wardItem.totalComplaints}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-ink-soft">
                        Open
                      </span>
                      <span className="font-mono text-base font-extrabold text-amber-700">
                        {wardItem.openComplaints}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-ink-soft">
                        Hotspots
                      </span>
                      <span className="font-mono text-base font-extrabold text-rose-700">
                        {wardItem.activeHotspots}
                      </span>
                    </div>
                  </div>

                  <CategoryCounts counts={wardItem.categoryCounts} />

                  <div className="flex items-center justify-between text-[11px] text-ink-soft">
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      Dominant: {formatCategory(wardItem.dominantCategory)}
                    </span>
                    {wardItem.overlapHotspots > 0 && (
                      <span className="font-bold text-amber-700">
                        {wardItem.overlapHotspots} overlap alert
                        {wardItem.overlapHotspots === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No ward-level complaint records match this time window." />
          )}
        </section>
      )}

      {/* Initial prompt for Nearby / Clusters before clicking Run Analysis */}
      {mode === "clusters" && !activeClusters && !error && !loading && (
        <div className="glass-panel flex flex-col items-center justify-center px-6 py-10 text-center">
          <Crosshair size={28} className="text-blue-700" weight="duotone" />
          <h2 className="mt-3 text-base font-bold text-ink">
            Configure &amp; Run Spatial Clustering
          </h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
            Use City-Wide Scan or specify coordinates above and click Run Analysis to compute DBSCAN clusters on demand.
          </p>
        </div>
      )}

      {mode === "nearby" && !activeNearby && !error && !loading && (
        <div className="glass-panel flex flex-col items-center justify-center px-6 py-10 text-center">
          <MagnifyingGlass size={28} className="text-blue-700" weight="duotone" />
          <h2 className="mt-3 text-base font-bold text-ink">
            Ready to scan nearby complaints
          </h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
            Click Run Analysis above to measure complaint density around the selected coordinates.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function ResultHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-ink-soft">{description}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass-panel p-4 ${
        highlight ? "border border-amber-300/80 bg-amber-50/40" : ""
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-extrabold tracking-tight ${
          highlight ? "text-amber-800" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CategoryCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([category, count]) => (
        <span
          key={category}
          className="rounded-full border border-slate-200 bg-white/60 px-3 py-1 text-[11px] font-semibold text-ink-soft"
        >
          {formatCategory(category)} · {count}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-panel flex flex-col items-center px-6 py-10 text-center">
      <MapPin size={26} className="text-ink-soft/60" />
      <p className="mt-3 text-sm font-semibold text-ink">Nothing to display</p>
      <p className="mt-1 max-w-md text-xs text-ink-soft">{message}</p>
    </div>
  );
}
