export type InvoiceVatItemSnapshot = {
  vatRate: number;
  lineTotalCents: number;
};

export type InvoiceVatGroup = {
  vatRate: number;
  taxableBaseCents: number;
  taxCents: number;
};

const taxFor = (baseCents: number, vatRate: number) => Math.round((baseCents * vatRate) / 100);

export function calculateVatSpecification(items: InvoiceVatItemSnapshot[], expectedTaxCents: number): InvoiceVatGroup[] {
  const basesByRate = new Map<number, number>();
  const lineTaxByRate = new Map<number, number>();

  for (const item of items) {
    const vatRate = Number(item.vatRate);
    const lineTotalCents = Number(item.lineTotalCents);
    if (!Number.isFinite(vatRate) || !Number.isFinite(lineTotalCents)) continue;
    basesByRate.set(vatRate, (basesByRate.get(vatRate) ?? 0) + lineTotalCents);
    lineTaxByRate.set(vatRate, (lineTaxByRate.get(vatRate) ?? 0) + taxFor(lineTotalCents, vatRate));
  }

  const groups = [...basesByRate.entries()]
    .map(([vatRate, taxableBaseCents]) => ({ vatRate, taxableBaseCents, taxCents: taxFor(taxableBaseCents, vatRate) }))
    .sort((left, right) => right.vatRate - left.vatRate);
  const groupedTaxCents = groups.reduce((total, group) => total + group.taxCents, 0);
  const lineTaxCents = groups.reduce((total, group) => total + (lineTaxByRate.get(group.vatRate) ?? 0), 0);

  if (lineTaxCents === expectedTaxCents && groupedTaxCents !== expectedTaxCents) {
    return groups.map((group) => ({ ...group, taxCents: lineTaxByRate.get(group.vatRate) ?? 0 }));
  }
  if (groupedTaxCents === expectedTaxCents || groups.length === 0) return groups;

  // Older snapshots can have another rounding method. The saved invoice total
  // remains authoritative, so the PDF must never display a contradictory VAT sum.
  return groups.map((group, index) => index === 0
    ? { ...group, taxCents: group.taxCents + expectedTaxCents - groupedTaxCents }
    : group);
}
