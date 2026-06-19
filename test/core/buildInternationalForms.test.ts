/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { describe, it, expect } from 'vitest';
import { buildInternationalForms } from '../../nodes/Ups/core/buildInternationalForms';
import { buildCommodities } from '../../nodes/Ups/core/buildCommodities';

const commodities = buildCommodities([
	{ description: 'Widget', quantity: 2, unitValue: 10, unitOfMeasure: 'EA' },
]);

const customs = {
	reasonForExport: 'SALE',
	currency: 'USD',
	termsOfShipment: 'DDU',
	invoiceNumber: 'INV-1001',
	soldTo: {
		name: 'Acme Imports',
		addressLines: ['12 King St'],
		city: 'Toronto',
		stateProvinceCode: 'ON',
		postalCode: 'M5H 1A1',
		countryCode: 'CA',
	},
};

describe('buildInternationalForms', () => {
	it('produces a commercial Invoice form (FormType ["01"]) only', () => {
		const forms = buildInternationalForms(customs, commodities);
		expect(forms.FormType).toEqual(['01']);
	});

	it('carries reason for export, currency, terms, and invoice number', () => {
		const forms = buildInternationalForms(customs, commodities);
		expect(forms.ReasonForExport).toBe('SALE');
		expect(forms.CurrencyCode).toBe('USD');
		expect(forms.TermsOfShipment).toBe('DDU');
		expect(forms.InvoiceNumber).toBe('INV-1001');
	});

	it('maps the sold-to contact and its address', () => {
		const forms = buildInternationalForms(customs, commodities);
		expect(forms.Contacts.SoldTo.Name).toBe('Acme Imports');
		expect(forms.Contacts.SoldTo.Address.CountryCode).toBe('CA');
		expect(forms.Contacts.SoldTo.Address.AddressLine).toEqual(['12 King St']);
	});

	it('embeds the commodity products', () => {
		const forms = buildInternationalForms(customs, commodities);
		expect(forms.Product).toHaveLength(1);
		expect(forms.Product[0].Description).toBe('Widget');
	});
});
