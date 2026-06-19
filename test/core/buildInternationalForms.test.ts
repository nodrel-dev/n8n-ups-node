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

	it('emits InvoiceDate (yyyyMMdd) when provided — UPS rejects with 128066 without it', () => {
		// Regression: international Create failed live with "128066 Invalid or missing invoice date"
		// because the invoice date was never threaded through. The caller (readCustoms) now defaults
		// it to today; this guards that the core forwards a supplied date verbatim.
		const forms = buildInternationalForms({ ...customs, invoiceDate: '20260619' }, commodities);
		expect(forms.InvoiceDate).toBe('20260619');
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
