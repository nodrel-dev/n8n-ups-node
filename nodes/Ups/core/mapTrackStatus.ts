import type { Activity, TrackResult } from './types';

// Pure core: shape the UPS Track response into TrackResult[] (one per package), and suppress the
// scan history client-side when the user asked for Status-only (contracts/track.md, data-model.md).
// Plain-in / plain-out — no IExecuteFunctions.

export type TrackDetail = 'detailed' | 'status';

interface RawAddress {
	city?: string;
	stateProvince?: string;
	countryCode?: string;
	country?: string;
}

interface RawStatus {
	type?: string;
	code?: string;
	statusCode?: string;
	description?: string;
}

interface RawActivity {
	date?: string;
	time?: string;
	status?: RawStatus;
	location?: { address?: RawAddress };
}

interface RawPackage {
	trackingNumber?: string;
	currentStatus?: RawStatus;
	service?: { code?: string; description?: string };
	deliveryDate?: Array<{ type?: string; date?: string }>;
	activity?: RawActivity[];
}

interface RawShipment {
	inquiryNumber?: string;
	package?: RawPackage[];
}

interface TrackResponse {
	trackResponse?: { shipment?: RawShipment[] };
}

function formatLocation(address?: RawAddress): string | undefined {
	if (!address) return undefined;
	const parts = [
		address.city,
		address.stateProvince,
		address.countryCode ?? address.country,
	].filter((p): p is string => Boolean(p));
	return parts.length > 0 ? parts.join(', ') : undefined;
}

function mapActivity(raw: RawActivity): Activity {
	return {
		date: raw.date,
		time: raw.time,
		statusType: raw.status?.type,
		statusCode: raw.status?.code,
		statusDescription: raw.status?.description,
		location: formatLocation(raw.location?.address),
	};
}

function pickDeliveryDate(pkg: RawPackage): string | undefined {
	if (!Array.isArray(pkg.deliveryDate) || pkg.deliveryDate.length === 0) return undefined;
	// Prefer an explicit delivered (DEL) entry; otherwise take the last listed date.
	const delivered = pkg.deliveryDate.find((d) => d.type === 'DEL');
	return (delivered ?? pkg.deliveryDate[pkg.deliveryDate.length - 1]).date;
}

export function mapTrackStatus(
	response: TrackResponse,
	options: { detail: TrackDetail },
): TrackResult[] {
	const shipments = response.trackResponse?.shipment ?? [];
	const results: TrackResult[] = [];

	for (const shipment of shipments) {
		for (const pkg of shipment.package ?? []) {
			const status = pkg.currentStatus;
			const result: TrackResult = {
				trackingNumber: pkg.trackingNumber ?? shipment.inquiryNumber ?? '',
				statusType: status?.type,
				statusCode: status?.code,
				statusDescription: status?.description,
				deliveryDate: pickDeliveryDate(pkg),
				service: pkg.service?.description,
			};

			// Detailed keeps the scan history; Status-only suppresses it (client-side, FR per §12.11).
			if (options.detail === 'detailed' && Array.isArray(pkg.activity) && pkg.activity.length > 0) {
				result.activity = pkg.activity.map(mapActivity);
			}

			results.push(result);
		}
	}

	return results;
}
