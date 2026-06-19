import { extractLabel, type LabelFormat } from './extractLabel';
import { extractForms } from './extractForms';
import { extractCharges, type ExtractedCharges } from './extractCharges';

// Pure core: assemble Create's output from the UPS ship response. The three response extractors
// (extractLabel / extractForms / extractCharges) are each unit-tested, but the assembly that wires
// them — the domestic-vs-international branch, the labels[0]/forms[0] null guards, and the
// `international: forms.length > 0` json shape — used to live untested inside postReceive. Pulling it
// here leaves postReceive holding only the n8n-only step (prepareBinaryData over binaryParts), and
// makes the assembly a fixture-backed assertion (Principle 10). The base64 stays in binaryParts and
// never lands in `json` (FR-009).

export interface BinaryPart {
	// n8n binary key the caller attaches the decoded buffer under (e.g. 'label', 'customsInvoice').
	key: string;
	base64: string;
	mime: string;
	filename: string;
}

export interface ShipmentResult {
	json: {
		shipmentId: string;
		trackingNumbers: string[];
		international: boolean;
		charges: ExtractedCharges;
	};
	binaryParts: BinaryPart[];
}

export function buildShipmentResult(response: object, format: LabelFormat): ShipmentResult {
	const label = extractLabel(response, format);
	const forms = extractForms(response);
	const charges = extractCharges(response);

	const binaryParts: BinaryPart[] = [];
	if (label.labels[0]) {
		const l = label.labels[0];
		binaryParts.push({ key: 'label', base64: l.base64, mime: l.mime, filename: l.filename });
	}
	if (forms[0]) {
		binaryParts.push({
			key: 'customsInvoice',
			base64: forms[0].base64,
			mime: forms[0].mime,
			filename: forms[0].filename,
		});
	}

	return {
		json: {
			shipmentId: label.shipmentId,
			trackingNumbers: label.labels.map((x) => x.trackingNumber),
			// International shipments return a customs invoice Form; domestic shipments do not.
			international: forms.length > 0,
			charges,
		},
		binaryParts,
	};
}
