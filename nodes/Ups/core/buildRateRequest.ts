import type { IDataObject } from 'n8n-workflow';
import type { NormalizedAddressInput } from './toXavAddress';
import { toUpsAddress } from './toUpsAddress';

// Pure core: assemble the UPS `RateRequest` body for Get Rates (Shoptimeintransit) from already-read,
// already-resolved inputs. Moving assembly behind a plain seam makes the interface the test surface:
// every hard-won "verified live CIE" rate rule below is now a fixture-backed assertion instead of code
// only the Docker harness could reach (Principle 10). The node stays fully declarative — the preSend
// just reads params, calls this, and assigns the result to requestOptions.body (ADR-0004).

type RateAddress = NormalizedAddressInput & { residential?: boolean };

// Pre-built UPS package body (from readPackage): PackageWeight + optional Dimensions.
export interface UpsPackageBody {
	PackageWeight: { UnitOfMeasurement: { Code: string }; Weight: string };
	Dimensions?: {
		UnitOfMeasurement: { Code: string };
		Length: string;
		Width: string;
		Height: string;
	};
}

export interface RateRequestInput {
	accountNumber: string;
	shipper: RateAddress;
	shipTo: RateAddress;
	// Effective Origin already chosen by resolveShipmentParties (ShipFrom else Shipper).
	effectiveShipFrom: RateAddress;
	package: UpsPackageBody;
	weight: number;
	weightUnit: string;
	// Declared goods value; > 0 adds InvoiceLineTotal (required for international, harmless domestic).
	customsValue: number;
	currency: string;
}

export function buildRateRequest(input: RateRequestInput): IDataObject {
	const shipment: IDataObject = {
		Shipper: { ShipperNumber: input.accountNumber, Address: toUpsAddress(input.shipper) },
		ShipTo: { Address: toUpsAddress(input.shipTo) },
		ShipFrom: { Address: toUpsAddress(input.effectiveShipFrom) },
		PickupType: { Code: '01' },
		// Shoptimeintransit REQUIRES both DeliveryTimeInformation and ShipmentTotalWeight or UPS rejects
		// the request — 111563 (missing DeliveryTimeInformation) and a misleading 111546 "Invalid Weight"
		// (actually the missing ShipmentTotalWeight). Both verified live against CIE (gotchas §12).
		// PackageBillType 03 = non-document; v1 is single-package, so total weight = package weight.
		DeliveryTimeInformation: { PackageBillType: '03' },
		ShipmentTotalWeight: {
			UnitOfMeasurement: { Code: input.weightUnit, Description: input.weightUnit },
			Weight: String(input.weight),
		},
		// Empty NegotiatedRatesIndicator still requests negotiated rates (presence of the tag triggers it).
		ShipmentRatingOptions: { NegotiatedRatesIndicator: '' },
		Package: { PackagingType: { Code: '02' }, ...input.package },
	};

	if (input.customsValue > 0) {
		shipment.InvoiceLineTotal = {
			CurrencyCode: input.currency,
			MonetaryValue: String(input.customsValue),
		};
	}

	return {
		RateRequest: {
			Request: { TransactionReference: { CustomerContext: 'n8n-nodes-ups rate' } },
			PickupType: { Code: '01' },
			Shipment: shipment,
		},
	};
}
