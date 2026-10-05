import { locationSchema, type NoteLocation } from './domain.ts';

export function manualLocation(
  latitude: string,
  longitude: string,
  label: string,
  accuracy: number | null = null,
): NoteLocation {
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!decimal.test(latitude.trim()) || !decimal.test(longitude.trim()))
    throw new Error('Enter both latitude and longitude as decimal numbers.');
  const result = locationSchema.safeParse({
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracy,
    label: label.trim() || null,
  });
  if (!result.success)
    throw new Error(
      'Latitude must be −90 to 90, longitude −180 to 180, and the label at most 200 characters.',
    );
  return result.data;
}
export function locationCoordinates(location: NoteLocation): string {
  return `${location.latitude}, ${location.longitude}`;
}
export function locationMapUrl(location: NoteLocation): string {
  // No network lookup, embed, or reverse geocoder. Only used by an explicit link.
  const { latitude, longitude } = locationSchema.parse(location);
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
}
