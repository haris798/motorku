/**
 * Calculate the distance between two GPS coordinates using the Haversine formula.
 * Returns distance in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Sort locations by recorded_at timestamp (ascending) and calculate
 * the cumulative distance traveled by summing consecutive point-to-point distances.
 * Filters out points with unrealistic speeds (> 300 km/h) as GPS noise.
 */
export function calculateTotalDistance(
  locations: { latitude: number; longitude: number; recorded_at: string; speed?: number }[]
): number {
  if (locations.length < 2) return 0;

  // Sort by timestamp ascending
  const sorted = [...locations].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  let totalKm = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const dist = haversineDistance(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );

    // Calculate time difference in hours
    const timeDiffMs =
      new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

    // Estimate speed (km/h)
    const estimatedSpeed = timeDiffHours > 0 ? dist / timeDiffHours : 0;

    // Filter out GPS noise: skip if speed > 300 km/h or distance < 1 meter
    if (estimatedSpeed <= 300 && dist > 0.001) {
      totalKm += dist;
    }
  }

  // Round to 2 decimal places
  return Math.round(totalKm * 100) / 100;
}
