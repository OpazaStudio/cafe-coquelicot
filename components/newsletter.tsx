"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "./illustrations";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) return;
    setDone(true);
    setTimeout(() => setDone(false), 4000);
    setEmail("");
  };

  return (
    <div className="newsletter">
      <p className="eyebrow newsletter__eyebrow">Newsletter</p>
      <h3 className="newsletter__title">
        les fleurs
        <br />
        dans la boîte
      </h3>
      <p className="newsletter__sub">
        Une fois par mois, ce qu&apos;on cueille, ce qu&apos;on prépare,
        quelques ateliers et un mot doux. Rien de plus.
      </p>
      <form className="newsletter__form" onSubmit={submit}>
        <input
          className="newsletter__input"
          type="email"
          required
          placeholder="votre email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="newsletter__btn">
          Envoyer <ArrowRight />
        </button>
      </form>
      <p className={`newsletter__success${done ? " show" : ""}`}>
        merci ! à très vite ✿
      </p>
    </div>
  );
}
