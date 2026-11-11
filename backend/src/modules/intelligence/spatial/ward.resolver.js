const KNOWN_WARDS = [
  // Hyderabad
  {
    city: "Hyderabad",
    ward: "Ward 12 - Banjara Hills",
    zone: "Central Zone",
    latitude: 17.4156,
    longitude: 78.4357,
    areaSqKm: 2.8,
    maxDistanceKm: 5.0,
    keywords: ["banjara", "4th cross", "road no"],
  },
  {
    city: "Hyderabad",
    ward: "Ward 14 - Lakeview Colony",
    zone: "Central Zone",
    latitude: 17.4182,
    longitude: 78.4391,
    areaSqKm: 2.1,
    maxDistanceKm: 5.0,
    keywords: ["lakeview", "community park", "gate 2"],
  },
  {
    city: "Hyderabad",
    ward: "Ward 08 - School Road Sector",
    zone: "West Zone",
    latitude: 17.4112,
    longitude: 78.4312,
    areaSqKm: 2.4,
    maxDistanceKm: 5.0,
    keywords: ["school road", "govt. school", "sector 4", "jubilee"],
  },
  // Thiruvananthapuram / Kalambalam (Kerala)
  {
    city: "Thiruvananthapuram",
    ward: "Kalambalam Ward",
    zone: "Thiruvananthapuram Rural Zone",
    latitude: 8.7628,
    longitude: 76.7915,
    areaSqKm: 4.2,
    maxDistanceKm: 15.0,
    keywords: ["kalambalam", "nh-66 kalambalam", "kallambalam"],
  },
  {
    city: "Thiruvananthapuram",
    ward: "Ward 1 - Kazhakkoottam",
    zone: "North Zone",
    latitude: 8.5686,
    longitude: 76.8731,
    areaSqKm: 3.6,
    maxDistanceKm: 12.0,
    keywords: ["kazhakkoottam", "technopark", "trivandrum", "thiruvananthapuram"],
  },
  // Bengaluru
  {
    city: "Bengaluru",
    ward: "Ward 80 - Indiranagar",
    zone: "East Zone",
    latitude: 12.9784,
    longitude: 77.6408,
    areaSqKm: 3.1,
    maxDistanceKm: 10.0,
    keywords: ["indiranagar", "100 ft", "100ft", "cmh road"],
  },
  {
    city: "Bengaluru",
    ward: "Ward 151 - Koramangala",
    zone: "South Zone",
    latitude: 12.9352,
    longitude: 77.6245,
    areaSqKm: 3.4,
    maxDistanceKm: 10.0,
    keywords: ["koramangala", "sony world", "bengaluru", "bangalore"],
  },
  // Mumbai
  {
    city: "Mumbai",
    ward: "H-West Ward - Bandra",
    zone: "Western Suburbs",
    latitude: 19.0596,
    longitude: 72.8295,
    areaSqKm: 3.8,
    maxDistanceKm: 15.0,
    keywords: ["bandra", "hill road", "pali hill", "mumbai"],
  },
  // Delhi
  {
    city: "Delhi",
    ward: "Ward 141 - Connaught Place",
    zone: "New Delhi Zone",
    latitude: 28.6315,
    longitude: 77.2167,
    areaSqKm: 3.9,
    maxDistanceKm: 18.0,
    keywords: ["connaught", "janpath", "new delhi", "delhi"],
  },
  // Chennai
  {
    city: "Chennai",
    ward: "Zone 9 - T. Nagar",
    zone: "Central Chennai",
    latitude: 13.0418,
    longitude: 80.2341,
    areaSqKm: 3.2,
    maxDistanceKm: 15.0,
    keywords: ["t. nagar", "t nagar", "nungambakkam", "chennai"],
  },
  // Kochi
  {
    city: "Kochi",
    ward: "Division 62 - Ernakulam South",
    zone: "Ernakulam Zone",
    latitude: 9.9699,
    longitude: 76.2911,
    areaSqKm: 3.5,
    maxDistanceKm: 15.0,
    keywords: ["ernakulam", "mg road kochi", "kochi", "cochin"],
  },
];

const KNOWN_CITY_HUBS = [
  {
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    latitude: 17.4156,
    longitude: 78.4357,
    radiusKm: 35,
    aliases: ["hyderabad", "banjara hills", "jubilee hills", "secunderabad", "madhapur", "gachibowli"],
  },
  {
    city: "Thiruvananthapuram",
    state: "Kerala",
    country: "India",
    latitude: 8.7628,
    longitude: 76.7915,
    radiusKm: 55,
    aliases: ["thiruvananthapuram", "trivandrum", "kalambalam", "kallambalam", "varkala", "attingal", "kazhakkoottam"],
  },
  {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    latitude: 12.9784,
    longitude: 77.6408,
    radiusKm: 40,
    aliases: ["bengaluru", "bangalore", "indiranagar", "koramangala", "whitefield", "jayanagar"],
  },
  {
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    latitude: 19.0596,
    longitude: 72.8295,
    radiusKm: 40,
    aliases: ["mumbai", "bombay", "bandra", "andheri", "colaba", "dadar"],
  },
  {
    city: "Delhi",
    state: "Delhi NCR",
    country: "India",
    latitude: 28.6315,
    longitude: 77.2167,
    radiusKm: 45,
    aliases: ["delhi", "new delhi", "connaught place", "dwarka", "rohini", "saket"],
  },
  {
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    latitude: 13.0418,
    longitude: 80.2341,
    radiusKm: 35,
    aliases: ["chennai", "madras", "t nagar", "adyar", "velachery"],
  },
  {
    city: "Kochi",
    state: "Kerala",
    country: "India",
    latitude: 9.9816,
    longitude: 76.2999,
    radiusKm: 35,
    aliases: ["kochi", "cochin", "ernakulam", "edappally", "kakkanad"],
  },
  {
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    latitude: 18.5204,
    longitude: 73.8567,
    radiusKm: 35,
    aliases: ["pune", "kothrud", "hinjewadi", "shivajinagar"],
  },
  {
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
    latitude: 22.5726,
    longitude: 88.3639,
    radiusKm: 35,
    aliases: ["kolkata", "calcutta", "salt lake", "park street"],
  },
];

const CITY_CANONICAL_MAP = new Map([
  ["trivandrum", "Thiruvananthapuram"],
  ["thiruvananthapuram", "Thiruvananthapuram"],
  ["bangalore", "Bengaluru"],
  ["bengaluru", "Bengaluru"],
  ["bombay", "Mumbai"],
  ["mumbai", "Mumbai"],
  ["new delhi", "Delhi"],
  ["delhi", "Delhi"],
  ["madras", "Chennai"],
  ["chennai", "Chennai"],
  ["cochin", "Kochi"],
  ["kochi", "Kochi"],
  ["ernakulam", "Kochi"],
  ["calcutta", "Kolkata"],
  ["kolkata", "Kolkata"],
]);

const GENERIC_NON_CITY_TOKENS = new Set([
  "india",
  "usa",
  "united states",
  "uk",
  "united kingdom",
  "kerala",
  "karnataka",
  "telangana",
  "maharashtra",
  "tamil nadu",
  "west bengal",
  "andhra pradesh",
  "uttar pradesh",
  "rajasthan",
  "gujarat",
  "road",
  "main road",
  "street",
]);

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (
    lat1 === null ||
    lat1 === undefined ||
    lng1 === null ||
    lng1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lng2 === null ||
    lng2 === undefined
  ) {
    return null;
  }

  const nLat1 = Number(lat1);
  const nLng1 = Number(lng1);
  const nLat2 = Number(lat2);
  const nLng2 = Number(lng2);

  if (
    !Number.isFinite(nLat1) ||
    !Number.isFinite(nLng1) ||
    !Number.isFinite(nLat2) ||
    !Number.isFinite(nLng2)
  ) {
    return null;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(nLat2 - nLat1);
  const dLon = toRad(nLng2 - nLng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(nLat1)) *
      Math.cos(toRad(nLat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCityName(raw) {
  const cleaned = String(raw || "").replace(/[^a-zA-Z0-9\s.-]/g, "").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (CITY_CANONICAL_MAP.has(lower)) {
    return CITY_CANONICAL_MAP.get(lower);
  }
  return cleaned;
}

function inferCityFromAddress(address) {
  const addrLower = String(address || "").toLowerCase();
  if (!addrLower.trim()) return null;

  for (const hub of KNOWN_CITY_HUBS) {
    if (hub.aliases.some((alias) => addrLower.includes(alias))) {
      return hub.city;
    }
  }

  const parts = String(address)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    for (let i = parts.length - 1; i >= 1; i -= 1) {
      const candidate = parts[i].replace(/\b\d{5,6}\b/g, "").trim();
      const lower = candidate.toLowerCase();
      if (
        candidate.length >= 3 &&
        !GENERIC_NON_CITY_TOKENS.has(lower) &&
        !/^\d+$/.test(candidate)
      ) {
        return normalizeCityName(candidate);
      }
    }
  }

  return null;
}

function inferCityFromCoordinates(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return null;
  }

  let bestHub = null;
  let bestDistMeters = Infinity;

  for (const hub of KNOWN_CITY_HUBS) {
    const dist = haversineMeters(latitude, longitude, hub.latitude, hub.longitude);
    if (dist !== null && dist < bestDistMeters && dist <= hub.radiusKm * 1000) {
      bestDistMeters = dist;
      bestHub = hub;
    }
  }

  return bestHub ? bestHub.city : null;
}

function inferLocalityWardFromAddress(address) {
  if (!address || typeof address !== "string") {
    return null;
  }
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0].replace(/[^a-zA-Z0-9\s-]/g, "").trim();
  if (!first || first.length < 3) return null;

  return `${first.slice(0, 48)} Ward`;
}

function resolveWardAndZone({ latitude, longitude, address = "" } = {}) {
  const addrLower = String(address || "").toLowerCase();

  // 1. Direct keyword / address match to known municipal wards
  for (const w of KNOWN_WARDS) {
    if (w.keywords.some((kw) => addrLower.includes(kw))) {
      return {
        city: w.city,
        ward: w.ward,
        zone: w.zone,
        areaSqKm: w.areaSqKm,
      };
    }
  }

  // 2. Coordinate proximity match to known ward centroids within their jurisdictional range
  if (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined
  ) {
    let bestWard = null;
    let bestDistMeters = Infinity;

    for (const w of KNOWN_WARDS) {
      const dist = haversineMeters(latitude, longitude, w.latitude, w.longitude);
      if (
        dist !== null &&
        dist <= (w.maxDistanceKm || 12) * 1000 &&
        dist < bestDistMeters
      ) {
        bestDistMeters = dist;
        bestWard = w;
      }
    }

    if (bestWard) {
      return {
        city: bestWard.city,
        ward: bestWard.ward,
        zone: bestWard.zone,
        areaSqKm: bestWard.areaSqKm,
      };
    }
  }

  // 3. Multi-city fallback from address or coordinate hub + local ward name
  const resolvedCity =
    inferCityFromAddress(address) ||
    inferCityFromCoordinates(latitude, longitude) ||
    "General Jurisdiction";

  const inferredWard = inferLocalityWardFromAddress(address);
  if (inferredWard) {
    return {
      city: resolvedCity,
      ward: inferredWard,
      zone:
        resolvedCity !== "General Jurisdiction"
          ? `${resolvedCity} Region`
          : "Regional Cluster",
      areaSqKm: 4.0,
    };
  }

  return {
    city: resolvedCity,
    ward: "Unassigned Ward",
    zone:
      resolvedCity !== "General Jurisdiction"
        ? `${resolvedCity} Region`
        : "General Jurisdiction",
    areaSqKm: 4.0,
  };
}

function getWardAreaSqKm(wardName) {
  const found = KNOWN_WARDS.find(
    (w) => w.ward.toLowerCase() === String(wardName || "").toLowerCase(),
  );
  return found ? found.areaSqKm : 3.5;
}

function listDefinedWards() {
  return KNOWN_WARDS.map(({ city, ward, zone, latitude, longitude, areaSqKm }) => ({
    city,
    ward,
    zone,
    latitude,
    longitude,
    areaSqKm,
  }));
}

function searchPlacesOffline(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    return KNOWN_CITY_HUBS.map((hub) => ({
      label: `${hub.city}, ${hub.state}, ${hub.country}`,
      city: hub.city,
      state: hub.state,
      country: hub.country,
      latitude: hub.latitude,
      longitude: hub.longitude,
      source: "local-directory",
    }));
  }

  const results = [];
  const seen = new Set();

  for (const w of KNOWN_WARDS) {
    const label = `${w.ward}, ${w.city}`;
    if (
      w.ward.toLowerCase().includes(q) ||
      w.city.toLowerCase().includes(q) ||
      w.keywords.some((kw) => kw.includes(q) || q.includes(kw))
    ) {
      if (!seen.has(label)) {
        seen.add(label);
        results.push({
          label,
          city: w.city,
          ward: w.ward,
          zone: w.zone,
          latitude: w.latitude,
          longitude: w.longitude,
          source: "local-directory",
        });
      }
    }
  }

  for (const hub of KNOWN_CITY_HUBS) {
    const label = `${hub.city}, ${hub.state}, ${hub.country}`;
    if (
      hub.city.toLowerCase().includes(q) ||
      hub.state.toLowerCase().includes(q) ||
      hub.aliases.some((a) => a.includes(q) || q.includes(a))
    ) {
      if (!seen.has(label)) {
        seen.add(label);
        results.push({
          label,
          city: hub.city,
          state: hub.state,
          country: hub.country,
          latitude: hub.latitude,
          longitude: hub.longitude,
          source: "local-directory",
        });
      }
    }
  }

  return results;
}

function getCityHubByName(cityName) {
  const canonical = normalizeCityName(cityName);
  if (!canonical) return null;
  const lower = canonical.toLowerCase();
  return (
    KNOWN_CITY_HUBS.find(
      (hub) =>
        hub.city.toLowerCase() === lower ||
        hub.aliases.some((alias) => alias === lower),
    ) || null
  );
}

module.exports = {
  KNOWN_WARDS,
  KNOWN_CITY_HUBS,
  haversineMeters,
  resolveWardAndZone,
  normalizeCityName,
  getCityHubByName,
  inferCityFromAddress,
  inferCityFromCoordinates,
  getWardAreaSqKm,
  listDefinedWards,
  searchPlacesOffline,
};
