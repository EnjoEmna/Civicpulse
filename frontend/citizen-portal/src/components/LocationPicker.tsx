import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MagnifyingGlass, Crosshair } from "@phosphor-icons/react";
import { api } from "../api/client";
import type { GeocodePlaceResult } from "../types/complaint";

export interface SelectedLocation {
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  value: SelectedLocation | null;
  onChange: (location: SelectedLocation) => void;
  onPlaceSelect?: (place: GeocodePlaceResult) => void;
}

const DEFAULT_CENTER: [number, number] = [17.4156, 78.4357];

const markerIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 22px;
      height: 22px;
      background: #2563eb;
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function MapClickHandler({
  onChange,
}: {
  onChange: (location: SelectedLocation) => void;
}) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
}

function MapSync({ value }: { value: SelectedLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (
      value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    ) {
      map.setView([value.latitude, value.longitude], Math.max(map.getZoom(), 14));
    }
  }, [map, value?.latitude, value?.longitude]);

  return null;
}

export default function LocationPicker({
  value,
  onChange,
  onPlaceSelect,
}: LocationPickerProps) {
  const [mapCenter] = useState<[number, number]>(
    value ? [value.latitude, value.longitude] : DEFAULT_CENTER,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<GeocodePlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);

  async function handleSearchPlace() {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    setPickerNotice(null);
    try {
      const res = await api.geocodePlace(searchQuery.trim());
      setResults(res.results || []);
      if (!res.results || res.results.length === 0) {
        setPickerNotice(`No matching places found for "${searchQuery.trim()}".`);
      }
    } catch {
      setPickerNotice("Place search unavailable. Click directly on the map to pin.");
    } finally {
      setSearching(false);
    }
  }

  function handleSelectPlace(place: GeocodePlaceResult) {
    setResults([]);
    setSearchQuery(place.label);
    setPickerNotice(`Pinned ${place.city} (${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)})`);
    onChange({
      latitude: place.latitude,
      longitude: place.longitude,
    });
    if (onPlaceSelect) {
      onPlaceSelect(place);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setPickerNotice("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    setPickerNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLocating(false);
        setPickerNotice(`Using GPS location (${lat}, ${lng})`);
        onChange({ latitude: lat, longitude: lng });
      },
      () => {
        setLocating(false);
        setPickerNotice("Unable to retrieve browser GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="relative flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSearchPlace();
              }
            }}
            placeholder="Search any city, town, ward, or landmark..."
            aria-label="Search incident place"
            className="glass-input w-full py-2 pl-9 pr-3 text-xs"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSearchPlace()}
          disabled={searching}
          className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60 cursor-pointer"
        >
          {searching ? "Finding..." : "Find Place"}
        </button>

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-bold text-primary shadow-sm hover:bg-white disabled:opacity-60 cursor-pointer"
        >
          <Crosshair size={14} weight="bold" />
          {locating ? "Locating..." : "Use My Location"}
        </button>

        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-11 z-[1100] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur-xl">
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
              {results.map((place, idx) => (
                <li key={`${place.label}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-xs hover:bg-blue-50/70 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{place.label}</p>
                      <p className="text-[10px] text-ink-soft">
                        {place.city} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {place.source}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {pickerNotice && (
        <p className="text-[11px] font-medium text-indigo-700">{pickerNotice}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/70">
        <MapContainer
          center={mapCenter}
          zoom={value ? 15 : 13}
          scrollWheelZoom
          style={{ height: "320px", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onChange={onChange} />
          <MapSync value={value} />

          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const marker = event.target;
                  const position = marker.getLatLng();

                  onChange({
                    latitude: Number(position.lat.toFixed(6)),
                    longitude: Number(position.lng.toFixed(6)),
                  });
                },
              }}
            />
          )}
        </MapContainer>

        <div className="bg-white/70 px-3 py-2 text-xs text-ink-soft">
          Search a place, click &ldquo;Use My Location&rdquo;, click anywhere on the map, or drag the pin.
        </div>
      </div>
    </div>
  );
}
