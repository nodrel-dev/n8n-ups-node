import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

// Optional, NON-AUTH "Shipper Profile" credential (ADR-0005, Principle 6 v1.4.0). It holds reusable
// Shipper configuration — name, address, phone, and the UPS account number (ShipperNumber) — so a
// user shipping from multiple registered accounts (e.g. a Canada-registered and a US account) can
// swap the whole Shipper block by selecting a profile instead of re-typing eight-plus fields.
//
// This credential carries NO secret and NO `authenticate` block: it never authenticates a UPS
// request. `UpsOAuth2Api` remains the ONLY credential that authenticates, so n8n's multi-credential
// `authentication`-param disambiguation (gotchas §1) does not apply here. (The `Api` class/name
// suffix is an n8n community-node lint convention, not an indication that it authenticates.)
//
// It is read at run time via `getCredentials('upsShipperProfileApi')` in the Get Rates / Create
// `preSend` and merged into the Shipper block with precedence: explicit node field > profile >
// built-in default (the merge lives in resources/shipping/shared.ts so Rate and Create can't drift).
// Keeping the account number in the encrypted credential store also keeps it out of the workflow JSON.
//
// `testedBy` runs an OFFLINE validation in the node (Ups.node.ts → methods.credentialTest): there is
// nothing to call (no auth), so the Test button checks the profile is internally usable instead.
export class UpsShipperProfileApi implements ICredentialType {
	name = 'upsShipperProfileApi';

	displayName = 'UPS Shipper Profile API';

	icon: Icon = 'file:ups.svg';

	documentationUrl =
		'https://github.com/nodrel-dev/n8n-nodes-ups?tab=readme-ov-file#shipper-profiles';

	properties: INodeProperties[] = [
		{
			displayName: 'Account Number',
			name: 'accountNumber',
			type: 'string',
			default: '',
			description:
				'UPS account number (ShipperNumber). Must match the country registered for this account, or UPS rejects the call (111617 Rate / 120120 Ship).',
		},
		{
			displayName: 'Shipper Name',
			name: 'shipperName',
			type: 'string',
			default: '',
			description: 'Shipper contact/company name',
		},
		{
			displayName: 'Address Line 1',
			name: 'addressLine1',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Address Line 2',
			name: 'addressLine2',
			type: 'string',
			default: '',
		},
		{
			displayName: 'City',
			name: 'city',
			type: 'string',
			default: '',
		},
		{
			displayName: 'State / Province Code',
			name: 'stateProvinceCode',
			type: 'string',
			default: '',
			placeholder: 'NY',
		},
		{
			displayName: 'Postal Code',
			name: 'postalCode',
			type: 'string',
			default: '',
			placeholder: '10001',
		},
		{
			displayName: 'Country Code',
			name: 'countryCode',
			type: 'string',
			default: '',
			placeholder: 'US',
			description: 'Two-letter country code (e.g. US, CA). Must match the account registration.',
		},
		{
			displayName: 'Phone',
			name: 'phone',
			type: 'string',
			default: '',
			description: 'Shipper phone number. UPS may require this for cross-border shipments.',
		},
	];
}
