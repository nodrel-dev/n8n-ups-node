import type { Product } from './types';

// Pure core: map customs commodity lines into UPS `InternationalForms.Product[]` (data-model.md).
// Currency is NOT a per-product field in the UPS schema — it lives at the form level
// (buildInternationalForms.CurrencyCode), so it is intentionally not a parameter here.

export interface CommodityLineInput {
	description: string;
	quantity: number;
	unitValue: number;
	unitOfMeasure: string;
	commodityCode?: string;
	originCountry?: string;
}

export function buildCommodities(items: CommodityLineInput[]): Product[] {
	return items.map((item) => {
		const product: Product = {
			Description: item.description,
			Unit: {
				Number: String(item.quantity),
				UnitOfMeasurement: { Code: item.unitOfMeasure },
				Value: String(item.unitValue),
			},
		};
		if (item.commodityCode) product.CommodityCode = item.commodityCode;
		if (item.originCountry) product.OriginCountryCode = item.originCountry;
		return product;
	});
}
