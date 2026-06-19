import type {
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { toXavAddress, type NormalizedAddressInput } from '../../core/toXavAddress';
import { shapeCandidates } from '../../core/shapeCandidates';
import { mapUpsError } from '../../core/mapUpsError';

const showOnlyForValidate = {
	operation: ['validate'],
	resource: ['address'],
};

function readAddress(ctx: IExecuteSingleFunctions): NormalizedAddressInput {
	const line1 = ctx.getNodeParameter('addressLine1', '') as string;
	const line2 = ctx.getNodeParameter('addressLine2', '') as string;
	return {
		addressLines: [line1, line2].filter((l) => l && l.trim().length > 0),
		city: ctx.getNodeParameter('city', '') as string,
		stateProvinceCode: ctx.getNodeParameter('stateProvinceCode', '') as string,
		postalCode: ctx.getNodeParameter('postalCode', '') as string,
		countryCode: ctx.getNodeParameter('countryCode', 'US') as string,
	};
}

// preSend assembles the nested XAVRequest body from the flat parameters via the pure core.
async function validatePreSend(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	requestOptions.body = {
		XAVRequest: {
			AddressKeyFormat: toXavAddress(readAddress(this)),
		},
	};
	return requestOptions;
}

// postReceive surfaces UPS errors (ignoreHttpStatusErrors) and shapes a single Resolution item.
async function validatePostReceive(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode >= 400) {
		mapUpsError(this.getNode(), response.body, response.statusCode);
	}
	const result = shapeCandidates(response.body as object);
	return [{ json: result as unknown as INodeExecutionData['json'] }];
}

export const validateOperationDescription: INodeProperties[] = [
	{
		displayName: 'Address Line 1',
		name: 'addressLine1',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: showOnlyForValidate },
		description: 'Street address line 1',
	},
	{
		displayName: 'Address Line 2',
		name: 'addressLine2',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForValidate },
		description: 'Street address line 2 (optional)',
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForValidate },
		description: 'City (maps to PoliticalDivision2)',
	},
	{
		displayName: 'State / Province Code',
		name: 'stateProvinceCode',
		type: 'string',
		default: '',
		placeholder: 'NY',
		displayOptions: { show: showOnlyForValidate },
		description: 'Two-letter state or province code (maps to PoliticalDivision1)',
	},
	{
		displayName: 'Postal Code',
		name: 'postalCode',
		type: 'string',
		default: '',
		placeholder: '14201 or 14201-1234',
		displayOptions: { show: showOnlyForValidate },
		description: 'Postal code; a ZIP+4 is split into primary/extended automatically',
	},
	{
		displayName: 'Country Code',
		name: 'countryCode',
		type: 'string',
		default: 'US',
		displayOptions: { show: showOnlyForValidate },
		description:
			'Two-letter country code. Note: the CIE returns street-level validation for US NY/CA addresses only.',
	},
];

export const validateOperationOption = {
	name: 'Validate',
	value: 'validate',
	action: 'Validate an address',
	description: 'Validate and classify an address (residential/commercial)',
	routing: {
		request: {
			method: 'POST' as const,
			// requestoption = 3 → validation + classification (contracts/validate-address.md).
			url: '/addressvalidation/v2/3',
			ignoreHttpStatusErrors: true,
		},
		send: {
			preSend: [validatePreSend],
		},
		output: {
			postReceive: [validatePostReceive],
		},
	},
};
