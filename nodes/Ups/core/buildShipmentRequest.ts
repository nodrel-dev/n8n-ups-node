import type { IDataObject } from 'n8n-workflow';
import type { NormalizedAddressInput } from './toXavAddress';
import type { UpsPackageBody } from './buildRateRequest';
import { toUpsAddress } from './toUpsAddress';
import { buildCommodities, type CommodityLineInput } from './buildCommodities';
import { buildInternationalForms, type CustomsInput } from './buildInternationalForms';

// Pure core: assemble the UPS `ShipmentRequest` body for Create from already-read, already-resolved
// inputs. Every hard-won Ship rule — AttentionName mirroring, Type 01 BillShipper billing, the
// international InternationalForms branch, and the thermal LabelStockSize — now lives behind a plain
// seam so each "verified live CIE" comment is a fixture-backed test instead of code only the Docker
// harness could reach (Principle 10). The node stays fully declarative; the preSend reads params,
// runs the boundary guards, calls this, and assigns requestOptions.body (ADR-0004).

type ShipAddress = NormalizedAddressInput & { residential?: boolean };

export interface ShipmentRequestInput {
	accountNumber: string;
	service: string;
	labelFormat: string;
	international: boolean;
	shipper: { address: ShipAddress; name: string; phone: string };
	shipTo: { address: ShipAddress; name: string; phone: string };
	// ShipFrom name already defaulted to the Shipper name by the caller when left blank.
	shipFrom: { address: ShipAddress; name: string };
	package: UpsPackageBody;
	// Used only when `international`; ignored for domestic shipments.
	customs: CustomsInput;
	commodities: CommodityLineInput[];
}

export function buildShipmentRequest(input: ShipmentRequestInput): IDataObject {
	const { accountNumber, shipper, shipTo, shipFrom } = input;

	// UPS requires an AttentionName on each party for international shipments — omitting ShipFrom's
	// returns 120301 "Missing or invalid ship from attention name" (verified live CIE). Mirror the
	// party Name into AttentionName when present; harmless on domestic, mandatory cross-border.
	const shipment: IDataObject = {
		Description: 'Shipment',
		Shipper: {
			Name: shipper.name,
			...(shipper.name ? { AttentionName: shipper.name } : {}),
			ShipperNumber: accountNumber,
			...(shipper.phone ? { Phone: { Number: shipper.phone } } : {}),
			Address: toUpsAddress(shipper.address),
		},
		ShipTo: {
			Name: shipTo.name,
			...(shipTo.name ? { AttentionName: shipTo.name } : {}),
			...(shipTo.phone ? { Phone: { Number: shipTo.phone } } : {}),
			Address: toUpsAddress(shipTo.address),
		},
		ShipFrom: {
			Name: shipFrom.name,
			...(shipFrom.name ? { AttentionName: shipFrom.name } : {}),
			Address: toUpsAddress(shipFrom.address),
		},
		// Billing: shipper pays transportation (Type 01). International duties are DDU — no Type 02.
		PaymentInformation: {
			ShipmentCharge: { Type: '01', BillShipper: { AccountNumber: accountNumber } },
		},
		// Request negotiated rates so the response carries NegotiatedRateCharges (the actually-billed
		// cost) alongside published — same mechanism as Get Rates; presence of the tag is the trigger.
		ShipmentRatingOptions: { NegotiatedRatesIndicator: '' },
		Service: { Code: input.service },
		Package: {
			Packaging: { Code: '02' },
			...input.package,
		},
	};

	if (input.international) {
		const commodities = buildCommodities(input.commodities);
		shipment.ShipmentServiceOptions = {
			InternationalForms: buildInternationalForms(input.customs, commodities),
		};
	}

	// GIF is an image label and needs no stock size; the thermal formats (ZPL/EPL/SPL) are rejected with
	// 9120244 "Missing label specification label stock size" unless LabelStockSize is supplied. 4x6 in is
	// the standard thermal label (Height 6, Width 4). Verified live CIE.
	const labelSpecification: IDataObject = { LabelImageFormat: { Code: input.labelFormat } };
	if (input.labelFormat !== 'GIF') {
		labelSpecification.LabelStockSize = { Height: '6', Width: '4' };
	}

	return {
		ShipmentRequest: {
			Request: { RequestOption: 'nonvalidate' },
			Shipment: shipment,
			LabelSpecification: labelSpecification,
		},
	};
}
