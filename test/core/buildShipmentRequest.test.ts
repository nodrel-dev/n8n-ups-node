/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import {
	buildShipmentRequest,
	type ShipmentRequestInput,
} from '../../nodes/Ups/core/buildShipmentRequest';

// Typed view of the assembled ShipmentRequest body so assertions drill in without `any`.
interface Party {
	Name?: string;
	AttentionName?: string;
	ShipperNumber?: string;
	Phone?: { Number: string };
	Address?: Record<string, unknown>;
}
interface ShipBody {
	ShipmentRequest: {
		Request: Record<string, unknown>;
		LabelSpecification: Record<string, unknown>;
		Shipment: {
			Shipper: Party;
			ShipTo: Party;
			ShipFrom: Party;
			PaymentInformation: Record<string, unknown>;
			ShipmentServiceOptions?: {
				InternationalForms: {
					FormType: string[];
					CurrencyCode: string;
					Product: Array<{ Description: string }>;
				};
			};
		};
	};
}

const build = (input: ShipmentRequestInput): ShipBody =>
	buildShipmentRequest(input) as unknown as ShipBody;

const usShipper = {
	addressLines: ['1 Main St'],
	city: 'Buffalo',
	stateProvinceCode: 'NY',
	postalCode: '14201',
	countryCode: 'US',
};
const usShipTo = {
	addressLines: ['9 Oak Ave'],
	city: 'Boston',
	stateProvinceCode: 'MA',
	postalCode: '02101',
	countryCode: 'US',
};

function baseInput(overrides: Partial<ShipmentRequestInput> = {}): ShipmentRequestInput {
	return {
		accountNumber: 'A1234',
		service: '03',
		labelFormat: 'GIF',
		international: false,
		shipper: { address: usShipper, name: 'Acme Co', phone: '716-555-0000' },
		shipTo: { address: usShipTo, name: 'Jane Roe', phone: '' },
		shipFrom: { address: usShipper, name: 'Acme Co' },
		package: { PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: '5' } },
		customs: {
			reasonForExport: 'SALE',
			currency: 'USD',
			soldTo: { name: '', addressLines: [], city: '', countryCode: 'US' },
		},
		commodities: [],
		...overrides,
	};
}

describe('buildShipmentRequest', () => {
	it('mirrors each party Name into AttentionName when present (120301 guard)', () => {
		const s = build(baseInput()).ShipmentRequest.Shipment;
		expect(s.Shipper.AttentionName).toBe('Acme Co');
		expect(s.ShipFrom.AttentionName).toBe('Acme Co');
		expect(s.ShipTo.AttentionName).toBe('Jane Roe');
	});

	it('omits AttentionName and Phone when the party fields are blank', () => {
		const s = build(baseInput({ shipTo: { address: usShipTo, name: '', phone: '' } }))
			.ShipmentRequest.Shipment;
		expect(s.ShipTo).not.toHaveProperty('AttentionName');
		expect(s.ShipTo).not.toHaveProperty('Phone');
		// Shipper with a phone still carries it.
		expect(s.Shipper.Phone).toEqual({ Number: '716-555-0000' });
	});

	it('bills the shipper Type 01 (DDU — no Type 02) and hardcodes nonvalidate', () => {
		const body = build(baseInput());
		expect(body.ShipmentRequest.Request).toEqual({ RequestOption: 'nonvalidate' });
		expect(body.ShipmentRequest.Shipment.PaymentInformation).toEqual({
			ShipmentCharge: { Type: '01', BillShipper: { AccountNumber: 'A1234' } },
		});
	});

	it('keeps a GIF label free of LabelStockSize but adds 4x6 for thermal formats', () => {
		expect(build(baseInput({ labelFormat: 'GIF' })).ShipmentRequest.LabelSpecification).toEqual({
			LabelImageFormat: { Code: 'GIF' },
		});
		expect(build(baseInput({ labelFormat: 'ZPL' })).ShipmentRequest.LabelSpecification).toEqual({
			LabelImageFormat: { Code: 'ZPL' },
			LabelStockSize: { Height: '6', Width: '4' },
		});
	});

	it('omits ShipmentServiceOptions for domestic shipments', () => {
		expect(
			build(baseInput({ international: false })).ShipmentRequest.Shipment.ShipmentServiceOptions,
		).toBeUndefined();
	});

	it('assembles InternationalForms (commercial invoice) for international shipments', () => {
		const body = build(
			baseInput({
				international: true,
				shipTo: {
					address: {
						addressLines: ['10 Queen St'],
						city: 'Toronto',
						stateProvinceCode: 'ON',
						postalCode: 'M5H2N2',
						countryCode: 'CA',
					},
					name: 'Jean Roy',
					phone: '',
				},
				customs: {
					reasonForExport: 'SALE',
					currency: 'CAD',
					termsOfShipment: 'DDU',
					soldTo: {
						name: 'Jean Roy',
						addressLines: ['10 Queen St'],
						city: 'Toronto',
						countryCode: 'CA',
					},
				},
				commodities: [{ description: 'Widget', quantity: 2, unitValue: 25, unitOfMeasure: 'EA' }],
			}),
		);
		const forms = body.ShipmentRequest.Shipment.ShipmentServiceOptions?.InternationalForms;
		expect(forms?.FormType).toEqual(['01']);
		expect(forms?.CurrencyCode).toBe('CAD');
		expect(forms?.Product).toHaveLength(1);
		expect(forms?.Product[0].Description).toBe('Widget');
	});
});
