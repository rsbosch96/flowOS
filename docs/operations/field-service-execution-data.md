# FS1.3 execution data

FS1.3 execution records are operational evidence only. Materials never store
sales price, purchase price, VAT, discount or invoice totals. Notes are
internal and append-only. Evidence and sign-off rows are tenant-bound and
append-only; customer names, note bodies and file contents are not copied into
audit metadata.

## Evidence upload safety

Evidence upload preparation uses the private `company-documents` bucket and the
canonical path:

`<companyId>/field-service/<workOrderId>/<documentId>/<filename>`

The upload preparation route first authorizes the work order and then creates
the document registration and signed upload URL. If storage preparation fails,
the just-created document registration is removed by its exact document ID.
After a successful upload, the evidence-link route may be retried with the
same document ID; it accepts only the exact tenant/work-order path and never a
public URL. If a link cannot be repaired, cleanup is limited to that one
document/object after verifying that it is not referenced by an evidence or
sign-off row. Broad-prefix cleanup is prohibited.

Planning is optional: a work order and all execution records remain valid when
`planning_event_id` is null. No execution record changes quote, invoice,
catalog pricing or other financial snapshots.
