import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type {
  PersistedHotspot,
  SpatialComplaint,
  SpatialCluster,
} from "../../types/spatial";

type HotspotLike = (SpatialCluster | PersistedHotspot) & {
  status?: string;
};

interface SpatialMapProps {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  showSearchCircle?: boolean;
  complaints: SpatialComplaint[];
  clusters?: HotspotLike[];
  wardMarkers?: Array<{
    city?: string | null;
    ward: string;
    zone: string;
    totalComplaints: number;
    openComplaints: number;
    densityPerSqKm: number;
    activeHotspots: number;
    overlapHotspots: number;
    center: { latitude: number; longitude: number };
  }>;
  focusedLocation?: {
    latitude: number;
    longitude: number;
    hotspotId?: string | null;
    label?: string | null;
  } | null;
  onCenterSelect?: (coords: { latitude: number; longitude: number }) => void;
}

function MapBounds({
  positions,
  center,
  includeCenterInBounds,
  focusedLocation,
}: {
  positions: [number, number][];
  center: [number, number];
  includeCenterInBounds: boolean;
  focusedLocation?: {
    latitude: number;
    longitude: number;
    hotspotId?: string | null;
    label?: string | null;
  } | null;
}) {
  const map = useMap();
  const boundsSignature = useMemo(
    () =>
      JSON.stringify({
        positions,
        center,
        includeCenterInBounds,
        focusedLocation: focusedLocation
          ? {
              lat: focusedLocation.latitude,
              lng: focusedLocation.longitude,
              hotspotId: focusedLocation.hotspotId ?? null,
            }
          : null,
      }),
    [positions, center, includeCenterInBounds, focusedLocation],
  );

  useEffect(() => {
    if (
      focusedLocation &&
      Number.isFinite(focusedLocation.latitude) &&
      Number.isFinite(focusedLocation.longitude)
    ) {
      map.setView([focusedLocation.latitude, focusedLocation.longitude], 16, {
        animate: true,
      });
      return;
    }

    if (positions.length === 0) {
      map.setView(center, 12);
      return;
    }

    const pts = includeCenterInBounds ? [center, ...positions] : positions;
    const bounds = L.latLngBounds(pts);

    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 16,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsSignature]);

  return null;
}

function MapClickCenterSelector({
  onCenterSelect,
}: {
  onCenterSelect?: (coords: { latitude: number; longitude: number }) => void;
}) {
  useMapEvents({
    click(event) {
      if (!onCenterSelect) return;
      onCenterSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
}

function createClusterIcon(
  count: number,
  hasOverlap?: boolean,
  severity?: string,
) {
  const bg =
    severity === "CRITICAL"
      ? "#dc2626"
      : hasOverlap
        ? "#d97706"
        : "#2563eb";
  const ring = hasOverlap ? "0 0 0 4px rgba(245, 158, 11, 0.35)," : "";

  return L.divIcon({
    className: "spatial-cluster-icon",
    html: `
      <div style="
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${bg};
        color: white;
        border: 3px solid white;
        box-shadow: ${ring} 0 2px 8px rgba(0,0,0,0.3);
        font-size: 14px;
        font-weight: 800;
      ">
        ${count}
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21],
  });
}

function createWardIcon(count: number, overlapHotspots: number) {
  const bg = overlapHotspots > 0 ? "#d97706" : "#4f46e5";
  return L.divIcon({
    className: "spatial-ward-icon",
    html: `
      <div style="
        min-width: 38px;
        height: 38px;
        padding: 0 8px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${bg};
        color: white;
        border: 2.5px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
        font-size: 12px;
        font-weight: 800;
      ">
        ${count}
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19],
  });
}

export default function SpatialMap({
  center,
  radiusMeters,
  showSearchCircle = true,
  complaints,
  clusters,
  wardMarkers,
  focusedLocation,
  onCenterSelect,
}: SpatialMapProps) {
  const mapCenter: [number, number] = focusedLocation
    ? [focusedLocation.latitude, focusedLocation.longitude]
    : [center.latitude, center.longitude];

  const isClusterMode = clusters !== undefined;
  const isWardMode = wardMarkers !== undefined;

  const positions: [number, number][] = isWardMode
    ? wardMarkers.map(
        (w) => [w.center.latitude, w.center.longitude] as [number, number],
      )
    : isClusterMode
      ? clusters.map(
          (cluster) =>
            [cluster.centroid.latitude, cluster.centroid.longitude] as [
              number,
              number,
            ],
        )
      : complaints.map(
          (complaint) =>
            [complaint.latitude, complaint.longitude] as [number, number],
        );

  return (
    <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-white/60 shadow-ios-glass">
      <MapContainer
        center={mapCenter}
        zoom={14}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBounds
          positions={positions}
          center={mapCenter}
          includeCenterInBounds={showSearchCircle}
          focusedLocation={focusedLocation}
        />
        <MapClickCenterSelector onCenterSelect={onCenterSelect} />

        {focusedLocation && (
          <CircleMarker
            center={[focusedLocation.latitude, focusedLocation.longitude]}
            radius={14}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#3b82f6",
              fillOpacity: 0.24,
              weight: 3,
            }}
          >
            <Popup>
              <div className="space-y-0.5 text-xs">
                <strong className="text-blue-700">Focused Location</strong>
                {focusedLocation.label && <p className="font-medium">{focusedLocation.label}</p>}
                <p className="font-mono text-[11px] text-slate-600">
                  {focusedLocation.latitude.toFixed(5)}, {focusedLocation.longitude.toFixed(5)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {showSearchCircle && (
          <>
            <Circle
              center={mapCenter}
              radius={radiusMeters}
              pathOptions={{
                color: "#6366f1",
                fillColor: "#6366f1",
                fillOpacity: 0.06,
                weight: 2,
              }}
            />

            <CircleMarker
              center={mapCenter}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#6366f1",
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>Analysis Center</Popup>
            </CircleMarker>
          </>
        )}

        {/* Nearby complaint markers */}
        {!isClusterMode &&
          !isWardMode &&
          complaints.map((complaint) => (
            <CircleMarker
              key={complaint.id}
              center={[complaint.latitude, complaint.longitude]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#ef4444",
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div className="min-w-[190px] space-y-1 text-xs">
                  <strong>{complaint.referenceId}</strong>
                  <p className="font-semibold">{complaint.title}</p>
                  {(complaint.city || complaint.ward) && (
                    <p>
                      Location:{" "}
                      {[complaint.ward, complaint.city].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p>Category: {complaint.canonicalCategory}</p>
                  <p>Status: {complaint.status}</p>
                  <p>Distance: {complaint.distanceMeters.toFixed(1)} m</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Cluster / Persisted Hotspot footprints & markers */}
        {isClusterMode &&
          !isWardMode &&
          clusters.map((cluster) => {
            const clusterKey =
              "id" in cluster && cluster.id
                ? cluster.id
                : "clusterId" in cluster
                  ? cluster.clusterId
                  : `${cluster.centroid.latitude}-${cluster.centroid.longitude}`;
            const isCritical = cluster.severity === "CRITICAL";
            const footprintColor = isCritical
              ? "#dc2626"
              : cluster.hasCrossCategoryOverlap
                ? "#d97706"
                : "#2563eb";

            return (
              <div key={clusterKey}>
                <Circle
                  center={[
                    cluster.centroid.latitude,
                    cluster.centroid.longitude,
                  ]}
                  radius={Math.max(45, cluster.radiusMeters || 80)}
                  pathOptions={{
                    color: footprintColor,
                    fillColor: footprintColor,
                    fillOpacity: cluster.hasCrossCategoryOverlap ? 0.16 : 0.1,
                    weight: cluster.hasCrossCategoryOverlap ? 2.5 : 1.5,
                  }}
                />

                {cluster.complaints?.map((member) => (
                  <CircleMarker
                    key={`${clusterKey}-${member.id}`}
                    center={[member.latitude, member.longitude]}
                    radius={4.5}
                    pathOptions={{
                      color: "#ffffff",
                      fillColor: footprintColor,
                      fillOpacity: 0.9,
                      weight: 1.5,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[170px] space-y-1 text-xs">
                        <strong>{member.referenceId}</strong>
                        <p className="font-semibold">{member.title}</p>
                        <p>Category: {member.canonicalCategory}</p>
                        <p>Status: {member.status}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                <Marker
                  position={[
                    cluster.centroid.latitude,
                    cluster.centroid.longitude,
                  ]}
                  icon={createClusterIcon(
                    cluster.complaintCount,
                    cluster.hasCrossCategoryOverlap,
                    cluster.severity,
                  )}
                  title={`${cluster.title || "Complaint Hotspot"} (${cluster.complaintCount} complaints)`}
                >
                  <Popup>
                    <div className="min-w-[225px] space-y-1.5 text-xs">
                      <strong className="block text-sm">
                        {cluster.title || "Complaint Hotspot"}
                      </strong>
                      {(cluster.city || cluster.ward) && (
                        <p className="text-slate-600">
                          {cluster.city ? `${cluster.city} · ` : ""}
                          {cluster.ward}
                          {cluster.zone ? ` · ${cluster.zone}` : ""}
                        </p>
                      )}
                      <p>
                        <strong>{cluster.complaintCount}</strong> complaints (
                        <strong>{cluster.openCount ?? 0}</strong> open) ·{" "}
                        <strong>{cluster.severity || "MEDIUM"}</strong>
                      </p>
                      {cluster.hasCrossCategoryOverlap &&
                        cluster.overlapSummary && (
                          <p className="rounded bg-amber-50 p-1.5 text-[11px] font-medium text-amber-900">
                            Overlap: {cluster.overlapSummary}
                          </p>
                        )}
                      <div>
                        <strong>Categories:</strong>{" "}
                        {Object.entries(cluster.categoryCounts)
                          .map(
                            ([category, count]) =>
                              `${category.replace(/_/g, " ")} (${count})`,
                          )
                          .join(", ")}
                      </div>
                      <div className="space-y-0.5 border-t pt-1">
                        {cluster.complaints.slice(0, 5).map((c) => (
                          <p key={c.id} className="truncate">
                            {c.referenceId} — {c.title}
                          </p>
                        ))}
                        {cluster.complaints.length > 5 && (
                          <p className="text-slate-500">
                            + {cluster.complaints.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </div>
            );
          })}

        {/* Ward Markers */}
        {isWardMode &&
          wardMarkers.map((wardItem) => (
            <div key={`${wardItem.city || "gen"}-${wardItem.ward}`}>
              <Circle
                center={[wardItem.center.latitude, wardItem.center.longitude]}
                radius={Math.max(180, Math.min(800, wardItem.totalComplaints * 110))}
                pathOptions={{
                  color: wardItem.overlapHotspots > 0 ? "#d97706" : "#4f46e5",
                  fillColor:
                    wardItem.overlapHotspots > 0 ? "#f59e0b" : "#6366f1",
                  fillOpacity: 0.14,
                  weight: 2,
                }}
              />
              <Marker
                position={[
                  wardItem.center.latitude,
                  wardItem.center.longitude,
                ]}
                icon={createWardIcon(
                  wardItem.totalComplaints,
                  wardItem.overlapHotspots,
                )}
                title={wardItem.ward}
              >
                <Popup>
                  <div className="min-w-[190px] space-y-1 text-xs">
                    {wardItem.city && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                        {wardItem.city}
                      </p>
                    )}
                    <strong className="text-sm">{wardItem.ward}</strong>
                    <p className="text-slate-600">{wardItem.zone}</p>
                    <p>
                      Total: <strong>{wardItem.totalComplaints}</strong> · Open:{" "}
                      <strong>{wardItem.openComplaints}</strong>
                    </p>
                    <p>Density: {wardItem.densityPerSqKm} / km²</p>
                    <p>Active hotspots: {wardItem.activeHotspots}</p>
                  </div>
                </Popup>
              </Marker>
            </div>
          ))}
      </MapContainer>
    </div>
  );
}
