import { LoginForm } from "@/features/auth/components/login-form";
import { getPreferredLanguage } from "@/i18n/server";
import { LanguageSwitcher } from "@/i18n/language-switcher";

export default async function LoginPage() {
  const language = await getPreferredLanguage();
  return <main className="relative mx-auto flex min-h-screen max-w-md items-center px-6"><div className="absolute right-6 top-6"><LanguageSwitcher initialLanguage={language} /></div><LoginForm language={language} /></main>;
}
