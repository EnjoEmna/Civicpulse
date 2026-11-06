import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { SpatialComplaint } from "../../types/spatial";

interface SpatialMapProps {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  complaints: SpatialComplaint[];
}

function MapBounds({
  complaints,
  center,
}: {
  complaints: SpatialComplaint[];
  center: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (complaints.length === 0) {
      map.setView(center, 14);
      return;
    }

    const bounds = L.latLngBounds([
      center,
      ...complaints.map(
        (complaint) =>
          [complaint.latitude, complaint.longitude] as [number, number],
      ),
    ]);

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }, [map, complaints, center]);

  return null;
}

export default function SpatialMap({
  center,
  radiusMeters,
  complaints,
}: SpatialMapProps) {
  const mapCenter: [number, number] = [center.latitude, center.longitude];

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

        <MapBounds complaints={complaints} center={mapCenter} />

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

        {/* Complaint locations */}
        {complaints.map((complaint) => (
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
      </MapContainer>
    </div>
  );
}
