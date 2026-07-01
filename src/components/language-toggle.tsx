"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

type LanguageCode = "es" | "en";

const STORAGE_KEY = "roatanselfstorage-language";
const GOOGLE_COOKIE = "googtrans";
const GOOGLE_ELEMENT_ID = "google_translate_element";
const CHANGE_EVENT = "roatanselfstorage-language-change";

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement: new (
          options: {
            pageLanguage: string;
            includedLanguages: string;
            autoDisplay: boolean;
            layout?: unknown;
          },
          elementId: string,
        ) => void;
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

function getStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") {
    return "es";
  }

  return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "es";
}

function setGoogleCookie(language: LanguageCode) {
  const value = `/es/${language}`;
  const hostnameParts = window.location.hostname.split(".");
  const domains = [window.location.hostname];

  if (hostnameParts.length > 1) {
    domains.push(`.${hostnameParts.slice(-2).join(".")}`);
  }

  document.cookie = `${GOOGLE_COOKIE}=${value};path=/;max-age=31536000;SameSite=Lax`;
  domains.forEach((domain) => {
    document.cookie = `${GOOGLE_COOKIE}=${value};domain=${domain};path=/;max-age=31536000;SameSite=Lax`;
  });
}

function findGoogleSelect(): HTMLSelectElement | null {
  return document.querySelector<HTMLSelectElement>(".goog-te-combo");
}

function dispatchGoogleSelect(language: LanguageCode) {
  const select = findGoogleSelect();

  if (!select) {
    return false;
  }

  select.value = language;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function applyLanguage(language: LanguageCode) {
  window.localStorage.setItem(STORAGE_KEY, language);
  document.documentElement.lang = language;
  document.body.classList.add("language-is-changing");
  setGoogleCookie(language);

  let attempts = 0;
  const tryApply = () => {
    attempts += 1;
    const applied = dispatchGoogleSelect(language);

    if (!applied && attempts < 20) {
      window.setTimeout(tryApply, 150);
      return;
    }

    window.setTimeout(() => {
      document.body.classList.remove("language-is-changing");
    }, 520);
  };

  tryApply();
}

export function GoogleTranslateController() {
  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const language = (event as CustomEvent<LanguageCode>).detail;
      applyLanguage(language === "en" ? "en" : "es");
    };

    window.addEventListener(CHANGE_EVENT, onLanguageChange);
    window.googleTranslateElementInit = () => {
      if (!window.google?.translate?.TranslateElement || !document.getElementById(GOOGLE_ELEMENT_ID)) {
        return;
      }

      new window.google.translate.TranslateElement(
        {
          pageLanguage: "es",
          includedLanguages: "es,en",
          autoDisplay: false,
        },
        GOOGLE_ELEMENT_ID,
      );

      window.setTimeout(() => applyLanguage(getStoredLanguage()), 350);
    };

    document.documentElement.lang = getStoredLanguage();
    setGoogleCookie(getStoredLanguage());

    return () => {
      window.removeEventListener(CHANGE_EVENT, onLanguageChange);
    };
  }, []);

  return (
    <>
      <div id={GOOGLE_ELEMENT_ID} className="google-translate-host" aria-hidden="true" />
      <Script
        id="google-translate-script"
        src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="afterInteractive"
      />
    </>
  );
}

export function LanguageToggle() {
  const [language, setLanguage] = useState<LanguageCode>(() => getStoredLanguage());

  const nextLanguage: LanguageCode = language === "es" ? "en" : "es";
  const label = language === "es" ? "Traducir a inglés" : "Volver a español";

  const handleClick = () => {
    setLanguage(nextLanguage);
    window.dispatchEvent(new CustomEvent<LanguageCode>(CHANGE_EVENT, { detail: nextLanguage }));
  };

  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      onClick={handleClick}
      translate="no"
      suppressHydrationWarning
      className="notranslate inline-flex h-10 w-10 items-center justify-center rounded-md border border-sky-300/70 bg-white/15 text-white transition hover:bg-white/25"
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 0 20" />
        <path d="M12 2a15.3 15.3 0 0 0 0 20" />
      </svg>
    </button>
  );
}
