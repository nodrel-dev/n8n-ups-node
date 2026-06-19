import type { InternationalForms, Product } from './types';

// Pure core: assemble the commercial-invoice customs forms block (FormType ["01"] only in v1 —
// Principle 13). Combines the customs metadata with the already-built commodity Product[]
// (contracts/create-shipment.md, data-model.md).

export interface CustomsInput {
	reasonForExport: string;
	currency: string;
	termsOfShipment?: string;
	invoiceNumber?: string;
	invoiceDate?: string;
	soldTo: {
		name: string;
		addressLines: string[];
		city: string;
		stateProvinceCode?: string;
		postalCode?: string;
		countryCode: string;
	};
}

export function buildInternationalForms(
	customs: CustomsInput,
	commodities: Product[],
): InternationalForms {
	const forms: InternationalForms = {
		FormType: ['01'], // Commercial Invoice only (decision 12.3 / Principle 13).
		ReasonForExport: customs.reasonForExport,
		CurrencyCode: customs.currency,
		Contacts: {
			SoldTo: {
				Name: customs.soldTo.name,
				Address: {
					AddressLine: (customs.soldTo.addressLines ?? []).filter((l) => l && l.trim().length > 0),
					City: customs.soldTo.city,
					CountryCode: customs.soldTo.countryCode,
				},
			},
		},
		Product: commodities,
	};

	if (customs.soldTo.stateProvinceCode)
		forms.Contacts.SoldTo.Address.StateProvinceCode = customs.soldTo.stateProvinceCode;
	if (customs.soldTo.postalCode)
		forms.Contacts.SoldTo.Address.PostalCode = customs.soldTo.postalCode;
	if (customs.termsOfShipment) forms.TermsOfShipment = customs.termsOfShipment;
	if (customs.invoiceNumber) forms.InvoiceNumber = customs.invoiceNumber;
	if (customs.invoiceDate) forms.InvoiceDate = customs.invoiceDate;

	return forms;
}
