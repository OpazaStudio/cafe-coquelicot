import { formatEuros } from "@/lib/money";
import { MONDIAL_RELAY_FEE_CENTS } from "@/lib/order-status";
import type { Settings } from "@/lib/settings";
import { LegalValue } from "./legal-value";
import { LegalNav, ShopAddress, ShopEmail } from "./legal-page";

export function LivraisonRetoursContent({ settings }: { settings: Settings }) {
  return (
    <>
      <LegalNav current="/livraison-retours" />
      <p className="legal__intro">
        Nos bouquets partent de l&apos;atelier de La Rochelle et sont livrés en point
        relais Mondial Relay, partout en France métropolitaine.
      </p>

      <h2>Préparation</h2>
      <p>
        Chaque commande est composée à la main à l&apos;atelier, sous{" "}
        <LegalValue value={settings.preparation_delay} label="délai de préparation" />.
        Les fleurs fraîches sont préparées au plus près du départ pour arriver dans
        le meilleur état possible.
      </p>

      <h2>Livraison en point relais Mondial Relay</h2>
      <p>
        Vous choisissez votre point relais lors de la commande. Le colis est ensuite
        acheminé sous{" "}
        <LegalValue value={settings.shipping_delay} label="délai d'acheminement" />{" "}
        après dépôt. Vous êtes prévenu·e par SMS ou e-mail par Mondial Relay dès que
        le colis est disponible ; il vous attend ensuite plusieurs jours au relais.
        Frais de livraison : {formatEuros(MONDIAL_RELAY_FEE_CENTS)} par commande.
      </p>
      <p>
        Le numéro de suivi vous est communiqué dès l&apos;expédition. Les délais
        annoncés sont indicatifs ; un retard du transporteur ne peut donner lieu à
        annulation qu&apos;après mise en demeure restée sans effet, conformément à
        l&apos;article L. 216-6 du Code de la consommation.
      </p>

      <h2>Retrait à l&apos;atelier</h2>
      <p>
        Vous pouvez aussi venir chercher votre commande à l&apos;atelier :{" "}
        <ShopAddress settings={settings} />. Écrivez-nous pour convenir d&apos;un
        créneau.
      </p>

      <h2>Colis abîmé ou fleurs non conformes</h2>
      <p>
        Si le colis arrive endommagé ou si les fleurs ne correspondent pas à votre
        commande, prévenez-nous sous 48 heures avec quelques photos à{" "}
        <ShopEmail settings={settings} />. Nous vous proposons un remplacement, un
        avoir ou un remboursement.
      </p>

      <h2>Retours et rétractation</h2>
      <p>
        Les fleurs fraîches sont des produits périssables : elles ne peuvent être ni
        reprises ni échangées (article L. 221-28, 4° du Code de la consommation).
        Les fleurs séchées et les vases peuvent être retournés dans les quatorze
        jours suivant la réception, complets et en parfait état, frais de retour à
        votre charge. Le remboursement intervient sous quatorze jours après réception
        du retour. Les conditions complètes figurent dans nos <a href="/cgv">CGV</a>.
      </p>
    </>
  );
}
