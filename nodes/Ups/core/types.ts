// Shared plain-data types for the pure transform cores (data-model.md, Principle 10).
// These are plain-in / plain-out shapes — no `IExecuteFunctions`, no n8n runtime imports —
// so every core is unit-testable in isolation and shared shapes never drift between operations.

/** A UPS monetary value, normalized. `null` when UPS omitted the charge (e.g. no negotiated rate). */
export interface Money {
	amount: string;
	currency: string;
}

/** A single scan/activity event in a Track result. */
export interface Activity {
	date?: string;
	time?: string;
	statusType?: string;
	statusCode?: string;
	statusDescription?: string;
	location?: string;
}

/** Current status + optional scan history for one tracking number (Track). */
export interface TrackResult {
	trackingNumber: string;
	statusType?: string;
	statusCode?: string;
	statusDescription?: string;
	deliveryDate?: string;
	service?: string;
	activity?: Activity[];
}

/** Normalized postal address (shared input shape for the address cores). */
export interface Address {
	addressLines: string[];
	city: string;
	stateProvinceCode: string;
	postalCode: string;
	countryCode: string;
	residential?: boolean;
}

/** One service option from a rate quote, fanned out one per output item. */
export interface RateLine {
	serviceCode: string;
	serviceName: string;
	negotiated: Money | null;
	published: Money;
	billingWeight: string | null;
	transitDays: number | null;
	guaranteedBy: string | null;
	alerts: string[];
}

/** A customs commodity line for international forms (`InternationalForms.Product`). */
export interface Product {
	Description: string;
	Unit: {
		Number: string;
		UnitOfMeasurement: { Code: string };
		Value: string;
	};
	CommodityCode?: string;
	OriginCountryCode?: string;
	NumberOfPackagesPerCommodity?: string;
}

/** The assembled commercial-invoice customs forms block (`FormType ["01"]` only, v1). */
export interface InternationalForms {
	FormType: string[];
	InvoiceNumber?: string;
	InvoiceDate?: string;
	ReasonForExport: string;
	CurrencyCode: string;
	TermsOfShipment?: string;
	Contacts: {
		SoldTo: {
			Name: string;
			Address: {
				AddressLine: string[];
				City: string;
				StateProvinceCode?: string;
				PostalCode?: string;
				CountryCode: string;
			};
		};
	};
	Product: Product[];
}
