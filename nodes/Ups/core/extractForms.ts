// Pure core: pull the international customs invoice (PDF) out of the UPS ship response
// (contracts/create-shipment.md). Returns one entry per form image; empty for domestic shipments.
// The base64 lives only in `.base64` so the caller decodes it to a PDF binary (key `customsInvoice`).

export interface ExtractedForm {
	base64: string;
	mime: string;
	filename: string;
}

interface RawForm {
	Image?: { GraphicImage?: string; ImageFormat?: { Code?: string } };
}

interface ShipResponse {
	ShipmentResponse?: {
		ShipmentResults?: {
			ShipmentIdentificationNumber?: string;
			Form?: RawForm[] | RawForm;
		};
	};
}

function toArray<T>(value: T[] | T | undefined): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

export function extractForms(response: ShipResponse): ExtractedForm[] {
	const results = response.ShipmentResponse?.ShipmentResults;
	const shipmentId = results?.ShipmentIdentificationNumber ?? 'shipment';
	const forms = toArray(results?.Form);

	return forms
		.filter((form) => form.Image?.GraphicImage)
		.map((form, index) => ({
			base64: form.Image?.GraphicImage as string,
			// v1 commercial invoice is returned as PDF (decision 12.3).
			mime: 'application/pdf',
			filename: `customs-invoice-${shipmentId}${index > 0 ? `-${index + 1}` : ''}.pdf`,
		}));
}
