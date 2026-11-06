import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { SpatialComplaint, SpatialCluster } from "../../types/spatial";

interface SpatialMapProps {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  complaints: SpatialComplaint[];
  clusters?: SpatialCluster[];
}

function MapBounds({
  positions,
  center,
}: {
  positions: [number, number][];
  center: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) {
      map.setView(center, 14);
      return;
    }

    const bounds = L.latLngBounds([center, ...positions]);

    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 17,
    });
  }, [map, positions, center]);

  return null;
}

function createClusterIcon(count: number) {
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
        background: #2563eb;
        color: white;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
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

export default function SpatialMap({
  center,
  radiusMeters,
  complaints,
  clusters,
}: SpatialMapProps) {
  const mapCenter: [number, number] = [center.latitude, center.longitude];

  const isClusterMode = clusters !== undefined;

  const positions: [number, number][] = isClusterMode
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
    <div className="h-[480px] w-full overflow-hidden rounded-2xl border border-white/10">
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

        <MapBounds positions={positions} center={mapCenter} />

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

        {/* Analysis center */}
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

        {/* Nearby complaint markers */}
        {!isClusterMode &&
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
                <div className="min-w-[180px] space-y-1">
                  <strong>{complaint.referenceId}</strong>
                  <p>{complaint.title}</p>
                  <p>Category: {complaint.canonicalCategory}</p>
                  <p>Status: {complaint.status}</p>
                  <p>Distance: {complaint.distanceMeters.toFixed(1)} m</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Cluster hotspot markers */}
        {isClusterMode &&
          clusters.map((cluster) => (
            <Marker
              key={cluster.clusterId}
              position={[cluster.centroid.latitude, cluster.centroid.longitude]}
              icon={createClusterIcon(cluster.complaintCount)}
              title={`${cluster.complaintCount} complaints in hotspot`}
            >
              <Popup>
                <div className="min-w-[210px] space-y-2">
                  <strong className="text-sm">Complaint Hotspot</strong>

                  <p>
                    <strong>{cluster.complaintCount}</strong> complaints
                    identified
                  </p>

                  <div>
                    <strong>Categories</strong>
                    {Object.entries(cluster.categoryCounts).map(
                      ([category, count]) => (
                        <p key={category}>
                          {category.replace(/_/g, " ")}: {count}
                        </p>
                      ),
                    )}
                  </div>

                  <div>
                    <strong>Complaints</strong>

                    {cluster.complaints.slice(0, 8).map((complaint) => (
                      <p key={complaint.id}>
                        {complaint.referenceId} — {complaint.title}
                      </p>
                    ))}

                    {cluster.complaints.length > 8 && (
                      <p>+ {cluster.complaints.length - 8} more complaints</p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
