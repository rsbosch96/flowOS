"use client";
import { Button } from "@/components/ui/button";
export function DownloadInvoicePdfButton({ companyId, invoiceId }: { companyId: string; invoiceId: string }) { return <Button onClick={() => window.open(`/api/v1/companies/${companyId}/invoices/${invoiceId}/pdf`, "_blank", "noopener,noreferrer")}>Download PDF</Button>; }
