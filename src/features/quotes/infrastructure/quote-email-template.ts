export type QuoteEmailTemplateInput = {
  type: "initial" | "reminder";
  recipientName: string;
  companyName: string;
  quoteNumber: string;
  quoteTitle: string;
  publicUrl: string;
};

function safeText(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function plainText(value: string) {
  return safeText(value).replace(/[<>]/g, "");
}

export function escapeHtml(value: string) {
  return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function createQuoteEmail(input: QuoteEmailTemplateInput) {
  const recipientName = safeText(input.recipientName);
  const companyName = safeText(input.companyName);
  const quoteTitle = safeText(input.quoteTitle);
  const plainRecipientName = plainText(input.recipientName);
  const plainCompanyName = plainText(input.companyName);
  const plainQuoteNumber = plainText(input.quoteNumber);
  const plainQuoteTitle = plainText(input.quoteTitle);
  const publicUrl = safeText(input.publicUrl);
  const isReminder = input.type === "reminder";
  const subject = isReminder ? `Herinnering: offerte ${plainQuoteNumber}` : `Offerte ${plainQuoteNumber}: ${plainQuoteTitle}`;
  const actionText = isReminder ? "Bekijk en reageer op de offerte" : "Bekijk offerte";
  const introduction = isReminder ? `Graag herinneren wij u aan onze offerte ${quoteTitle}.` : "Uw offerte staat klaar.";
  const plainIntroduction = isReminder ? `Graag herinneren wij u aan onze offerte ${plainQuoteTitle}.` : "Uw offerte staat klaar.";

  return {
    subject,
    html: `<p>Beste ${escapeHtml(recipientName)},</p><p>${escapeHtml(introduction)}</p><p><a href="${escapeHtml(publicUrl)}">${escapeHtml(actionText)}</a></p><p>Met vriendelijke groet,<br>${escapeHtml(companyName)}</p>`,
    text: `Beste ${plainRecipientName},\n\n${plainIntroduction}\n\n${actionText}: ${publicUrl}\n\nMet vriendelijke groet,\n${plainCompanyName}`,
  };
}
