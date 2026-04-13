import { requireEnv } from "../lib/env";

export type PlaceLead = {
  placeId: string;
  businessName: string;
  website: string | null;
  phone: string | null;
  businessCategory: string | null;
  shortDescription: string | null;
  city: string | null;
  state: string | null;
};

function parseCityState(address: string | null): { city: string | null; state: string | null } {
  if (!address) return { city: null, state: null };
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length < 2) return { city: null, state: null };

  const city = parts[parts.length - 2] ?? null;
  const stateToken = (parts[parts.length - 1] ?? "").split(" ")[0] ?? null;
  return { city: city || null, state: stateToken || null };
}

export async function searchPlaces(textQuery: string, maxResultCount = 10): Promise<PlaceLead[]> {
  const apiKey = requireEnv("GOOGLE_PLACES_API_KEY");

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.primaryTypeDisplayName",
        "places.formattedAddress",
        "places.shortFormattedAddress"
      ].join(",")
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount,
      languageCode: "en"
    })
  });

  if (!response.ok) {
    throw new Error(`Google Places search failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      websiteUri?: string;
      nationalPhoneNumber?: string;
      primaryTypeDisplayName?: { text?: string };
      formattedAddress?: string;
      shortFormattedAddress?: string;
    }>;
  };

  return (json.places ?? [])
    .filter((p) => p.id && p.displayName?.text)
    .map((p) => {
      const address = p.shortFormattedAddress ?? p.formattedAddress ?? null;
      const { city, state } = parseCityState(address);

      return {
        placeId: p.id!,
        businessName: p.displayName!.text!,
        website: p.websiteUri ?? null,
        phone: p.nationalPhoneNumber ?? null,
        businessCategory: p.primaryTypeDisplayName?.text ?? null,
        shortDescription: address,
        city,
        state
      };
    });
}
