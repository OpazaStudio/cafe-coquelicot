"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendContactMessage, type ContactState } from "@/app/contact/actions";
import { ArrowRight } from "./illustrations";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(
    sendContactMessage,
    undefined,
  );
  const success = state?.status === "success";
  const doneRef = useRef<HTMLDivElement>(null);

  // Au succès le formulaire est démonté : on déplace le focus sur la
  // confirmation pour ne pas abandonner le focus clavier dans le vide.
  useEffect(() => {
    if (success) doneRef.current?.focus();
  }, [success]);

  return (
    <>
      {/* Région live rendue dès le 1er paint (vide) : sans cela, VoiceOver +
          Safari n'annoncent pas une region insérée avec son contenu. */}
      <div
        ref={doneRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
        className="contact-form__done"
      >
        {success && (
          <>
            <p className="contact-form__done-title">merci ✿</p>
            <p className="contact-form__done-text">
              Votre message est parti — on vous répond au plus vite.
            </p>
          </>
        )}
      </div>

      {!success && (
        <form action={action} className="contact-form">
          {/* Honeypot anti-spam — masqué (display:none) : invisible aux humains
              et à leur autofill, mais soumis si un bot le remplit. Nom
              synchronisé avec HONEYPOT_FIELD dans lib/email/contact.ts. */}
          <input
            type="text"
            name="website"
            autoComplete="off"
            className="contact-form__honeypot"
          />

          <div className="contact-form__row">
            <label className="form-field">
              <span>Nom *</span>
              <input name="name" required autoComplete="name" placeholder="Camille Martin" />
            </label>
            <label className="form-field">
              <span>Email *</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="camille@exemple.fr"
              />
            </label>
          </div>

          <label className="form-field">
            <span>Téléphone *</span>
            <input
              type="tel"
              inputMode="tel"
              name="phone"
              required
              autoComplete="tel"
              placeholder="06 12 34 56 78"
            />
          </label>

          <label className="form-field">
            <span>Message *</span>
            <textarea
              name="message"
              required
              rows={5}
              maxLength={2000}
              placeholder="Dites-nous tout — un projet, une question, un simple bonjour…"
            />
          </label>

          {state?.status === "error" && (
            <p role="alert" className="contact-form__error">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="btn btn--filled contact-form__submit"
          >
            {pending ? "Envoi…" : "Envoyer le message"} <ArrowRight />
          </button>
        </form>
      )}
    </>
  );
}
