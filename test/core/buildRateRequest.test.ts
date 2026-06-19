/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import {
	buildRateRequest,
	type RateRequestInput,
	type UpsPackageBody,
} from '../../nodes/Ups/core/buildRateRequest';

// Typed view of the assembled RateRequest body so assertions drill in without `any`.
interface RateBody {
	RateRequest: {
		Request: Record<string, unknown>;
		PickupType: Record<string, unknown>;
		Shipment: {
			Shipper: { ShipperNumber: string; Address: { City: string } };
			ShipTo: { Address: { City: string } };
			ShipFrom: { Address: { City: string } };
			DeliveryTimeInformation: Record<string, unknown>;
			ShipmentTotalWeight: Record<string, unknown>;
			ShipmentRatingOptions: Record<string, unknown>;
			Package: Record<string, unknown>;
			InvoiceLineTotal?: Record<string, unknown>;
		};
	};
}

const build = (input: RateRequestInput): RateBody => buildRateRequest(input) as unknown as RateBody;

const pkg: UpsPackageBody = {
	PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: '5' },
};

function baseInput(overrides: Partial<RateRequestInput> = {}): RateRequestInput {
	return {
		accountNumber: 'A1234',
		shipper: {
			addressLines: ['1 Main St'],
			city: 'Buffalo',
			stateProvinceCode: 'NY',
			postalCode: '14201',
			countryCode: 'US',
		},
		shipTo: {
			addressLines: ['9 Oak Ave'],
			city: 'Boston',
			stateProvinceCode: 'MA',
			postalCode: '02101',
			countryCode: 'US',
		},
		effectiveShipFrom: {
			addressLines: ['1 Main St'],
			city: 'Buffalo',
			stateProvinceCode: 'NY',
			postalCode: '14201',
			countryCode: 'US',
		},
		package: pkg,
		weight: 5,
		weightUnit: 'LBS',
		customsValue: 0,
		currency: 'USD',
		...overrides,
	};
}

describe('buildRateRequest', () => {
	it('carries the Shoptimeintransit twin containers UPS requires (111563 / 111546)', () => {
		const shipment = build(baseInput()).RateRequest.Shipment;
		// 111563 guard: DeliveryTimeInformation with non-document PackageBillType.
		expect(shipment.DeliveryTimeInformation).toEqual({ PackageBillType: '03' });
		// 111546 guard: ShipmentTotalWeight with a Description on UnitOfMeasurement (unlike PackageWeight).
		expect(shipment.ShipmentTotalWeight).toEqual({
			UnitOfMeasurement: { Code: 'LBS', Description: 'LBS' },
			Weight: '5',
		});
	});

	it('sets ShipperNumber and requests negotiated rates via an empty indicator', () => {
		const shipment = build(baseInput()).RateRequest.Shipment;
		expect(shipment.Shipper.ShipperNumber).toBe('A1234');
		expect(shipment.ShipmentRatingOptions).toEqual({ NegotiatedRatesIndicator: '' });
		expect(shipment.Package).toEqual({
			PackagingType: { Code: '02' },
			PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: '5' },
		});
	});

	it('sends ShipFrom from the effective origin, not the Shipper', () => {
		const shipment = build(
			baseInput({
				effectiveShipFrom: {
					addressLines: ['50 Dock Rd'],
					city: 'Newark',
					stateProvinceCode: 'NJ',
					postalCode: '07102',
					countryCode: 'US',
				},
			}),
		).RateRequest.Shipment;
		expect(shipment.ShipFrom.Address.City).toBe('Newark');
		expect(shipment.Shipper.Address.City).toBe('Buffalo');
	});

	it('omits InvoiceLineTotal for domestic (customsValue 0) and adds it for international', () => {
		expect(
			build(baseInput({ customsValue: 0 })).RateRequest.Shipment.InvoiceLineTotal,
		).toBeUndefined();

		const intl = build(baseInput({ customsValue: 250, currency: 'CAD' })).RateRequest.Shipment;
		expect(intl.InvoiceLineTotal).toEqual({ CurrencyCode: 'CAD', MonetaryValue: '250' });
	});
});
