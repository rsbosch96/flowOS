export type QuoteEmailTemplateInput = {
  type: "initial" | "reminder";
  recipientName: string;
  companyName: string;
  quoteNumber: string;
  quoteTitle: string;
  publicUrl: string;
  language?: "nl" | "en" | "es" | "de";
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
  const language = input.language ?? "nl";
  const copy = {
    nl: { subject: isReminder ? `Herinnering: offerte ${plainQuoteNumber}` : `Offerte ${plainQuoteNumber}: ${plainQuoteTitle}`, action: isReminder ? "Bekijk en reageer op de offerte" : "Bekijk offerte", intro: isReminder ? `Graag herinneren wij u aan onze offerte ${quoteTitle}.` : "Uw offerte staat klaar.", greeting: "Beste", closing: "Met vriendelijke groet" },
    en: { subject: isReminder ? `Reminder: quote ${plainQuoteNumber}` : `Quote ${plainQuoteNumber}: ${plainQuoteTitle}`, action: isReminder ? "View and respond to the quote" : "View quote", intro: isReminder ? `A reminder about our quote ${plainQuoteTitle}.` : "Your quote is ready.", greeting: "Hello", closing: "Kind regards" },
    es: { subject: isReminder ? `Recordatorio: presupuesto ${plainQuoteNumber}` : `Presupuesto ${plainQuoteNumber}: ${plainQuoteTitle}`, action: isReminder ? "Ver y responder al presupuesto" : "Ver presupuesto", intro: isReminder ? `Le recordamos nuestro presupuesto ${plainQuoteTitle}.` : "Su presupuesto está listo.", greeting: "Hola", closing: "Saludos cordiales" },
    de: { subject: isReminder ? `Erinnerung: Angebot ${plainQuoteNumber}` : `Angebot ${plainQuoteNumber}: ${plainQuoteTitle}`, action: isReminder ? "Angebot ansehen und beantworten" : "Angebot ansehen", intro: isReminder ? `Eine Erinnerung an unser Angebot ${plainQuoteTitle}.` : "Ihr Angebot ist bereit.", greeting: "Guten Tag", closing: "Mit freundlichen Grüßen" },
  }[language];
  const subject = copy.subject;
  const actionText = copy.action;
  const introduction = copy.intro;
  const plainIntroduction = copy.intro.replace(quoteTitle, plainQuoteTitle);

  return {
    subject,
    html: `<p>${copy.greeting} ${escapeHtml(recipientName)},</p><p>${escapeHtml(introduction)}</p><p><a href="${escapeHtml(publicUrl)}">${escapeHtml(actionText)}</a></p><p>${copy.closing},<br>${escapeHtml(companyName)}</p>`,
    text: `${copy.greeting} ${plainRecipientName},\n\n${plainIntroduction}\n\n${actionText}: ${publicUrl}\n\n${copy.closing},\n${plainCompanyName}`,
  };
}
