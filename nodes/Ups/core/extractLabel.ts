// Pure core: pull the shipment id + per-package label (base64 + mime + filename) out of the UPS
// ship response (contracts/create-shipment.md). The base64 lives ONLY in `labels[].base64` so the
// caller can decode it to n8n binary and never leak a GraphicImage string into JSON (FR-009).
// Filename = tracking number + a format-derived extension.

export type LabelFormat = 'GIF' | 'ZPL' | 'EPL' | 'SPL';

export interface ExtractedLabel {
	trackingNumber: string;
	base64: string;
	mime: string;
	filename: string;
}

export interface ExtractLabelResult {
	shipmentId: string;
	labels: ExtractedLabel[];
}

interface RawPackageResult {
	TrackingNumber?: string;
	ShippingLabel?: {
		ImageFormat?: { Code?: string };
		GraphicImage?: string;
	};
}

interface ShipResponse {
	ShipmentResponse?: {
		ShipmentResults?: {
			ShipmentIdentificationNumber?: string;
			PackageResults?: RawPackageResult[] | RawPackageResult;
		};
	};
}

// GIF is the only image format; ZPL/EPL/SPL are printer command languages → plain text payloads.
const MIME_BY_FORMAT: Record<string, string> = {
	GIF: 'image/gif',
	ZPL: 'text/plain',
	EPL: 'text/plain',
	SPL: 'text/plain',
};

function toArray<T>(value: T[] | T | undefined): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

export function extractLabel(response: ShipResponse, requestedFormat: string): ExtractLabelResult {
	const results = response.ShipmentResponse?.ShipmentResults;
	const shipmentId = results?.ShipmentIdentificationNumber ?? '';
	const packages = toArray(results?.PackageResults);

	const labels: ExtractedLabel[] = packages
		.filter((pkg) => pkg.ShippingLabel?.GraphicImage)
		.map((pkg) => {
			const format = (
				pkg.ShippingLabel?.ImageFormat?.Code ??
				requestedFormat ??
				'GIF'
			).toUpperCase();
			const trackingNumber = pkg.TrackingNumber ?? shipmentId;
			return {
				trackingNumber,
				base64: pkg.ShippingLabel?.GraphicImage as string,
				mime: MIME_BY_FORMAT[format] ?? 'application/octet-stream',
				filename: `${trackingNumber}.${format.toLowerCase()}`,
			};
		});

	return { shipmentId, labels };
}
