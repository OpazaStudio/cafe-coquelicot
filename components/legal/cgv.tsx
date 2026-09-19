import { formatEuros } from "@/lib/money";
import { CARD_FEE_CENTS, MONDIAL_RELAY_FEE_CENTS } from "@/lib/order-status";
import type { Settings } from "@/lib/settings";
import { LegalValue } from "./legal-value";
import { LegalNav, Mediator, ShopAddress, ShopEmail, ShopName } from "./legal-page";

export function CgvContent({ settings }: { settings: Settings }) {
  return (
    <>
      <LegalNav current="/cgv" />
      <p className="legal__intro">
        Les présentes conditions générales de vente (CGV) régissent les ventes
        conclues sur ce site entre <ShopName settings={settings} />, ci-après
        « la boutique », et toute personne physique non professionnelle, ci-après
        « le client ». Toute commande implique l&apos;acceptation sans réserve des
        présentes conditions.
      </p>

      <h2>1. Identification du vendeur</h2>
      <p>
        <ShopName settings={settings} />, <ShopAddress settings={settings} />,
        SIRET <LegalValue value={settings.siret} label="SIRET" />. Contact :{" "}
        <ShopEmail settings={settings} />.
      </p>

      <h2>2. Produits</h2>
      <p>
        La boutique propose des fleurs fraîches, des fleurs séchées, des
        compositions, des branches et des vases. Les fleurs sont des produits
        naturels et saisonniers : les photographies et illustrations ne sont pas
        contractuelles, et la composition peut varier selon les arrivages, dans le
        respect de l&apos;esprit, des couleurs et de la valeur du produit commandé.
      </p>

      <h2>3. Prix</h2>
      <p>
        Les prix sont indiqués en euros, toutes taxes comprises. Ils n&apos;incluent
        pas les frais de livraison, affichés avant la validation de la commande.
        Frais actuels : livraison en point relais Mondial Relay{" "}
        {formatEuros(MONDIAL_RELAY_FEE_CENTS)}, carte manuscrite optionnelle{" "}
        {formatEuros(CARD_FEE_CENTS)}. La boutique se réserve le droit de modifier ses
        prix à tout moment ; le prix applicable est celui affiché au moment de la
        commande.
      </p>

      <h2>4. Commande</h2>
      <p>
        Le client sélectionne ses produits, renseigne ses coordonnées et son point
        relais, puis est redirigé vers la page de paiement sécurisée. La commande est
        ferme et définitive après confirmation du paiement. Un récapitulatif est
        affiché à l&apos;écran et un reçu est envoyé par e-mail. La boutique peut
        refuser une commande en cas de litige antérieur, d&apos;indisponibilité ou
        d&apos;anomalie manifeste.
      </p>

      <h2>5. Paiement</h2>
      <p>
        Le paiement s&apos;effectue par carte bancaire via Stripe Payments Europe Ltd.
        Les données bancaires sont saisies sur les pages sécurisées de Stripe et ne
        transitent jamais par nos serveurs. La commande est débitée à la validation.
      </p>

      <h2>6. Livraison et retrait</h2>
      <p>
        Les commandes sont préparées à l&apos;atelier sous{" "}
        <LegalValue value={settings.preparation_delay} label="délai de préparation" />,
        puis remises à Mondial Relay pour livraison en point relais en France
        métropolitaine, sous{" "}
        <LegalValue value={settings.shipping_delay} label="délai d'acheminement" />.
        Une date de livraison souhaitée peut être indiquée à la commande ; elle est
        prise en compte dans la mesure du possible. Voir le détail dans la page{" "}
        <a href="/livraison-retours">Livraison &amp; retours</a>.
      </p>

      <h2>7. Droit de rétractation</h2>
      <p>
        Conformément à l&apos;article L. 221-18 du Code de la consommation, le client
        dispose de quatorze jours à compter de la réception pour se rétracter, sans
        motif, pour les produits non périssables (fleurs séchées, vases). Les
        produits doivent être retournés complets et en parfait état, frais de retour
        à la charge du client ; le remboursement intervient sous quatorze jours après
        réception du retour.
      </p>
      <p>
        En application de l&apos;article L. 221-28, 4° du Code de la consommation, le
        droit de rétractation ne s&apos;applique pas aux fleurs fraîches et
        compositions de fleurs fraîches, qui sont des biens susceptibles de se
        détériorer ou de se périmer rapidement (produits périssables).
      </p>

      <h2>8. Conformité et réclamations</h2>
      <p>
        La boutique est tenue des défauts de conformité (articles L. 217-3 et
        suivants du Code de la consommation) et des vices cachés (articles 1641 et
        suivants du Code civil). Un produit endommagé ou non conforme doit être
        signalé dans les 48 heures suivant la réception, photos à l&apos;appui, à{" "}
        <ShopEmail settings={settings} />. La boutique propose alors, à son choix, un
        remplacement, un avoir ou un remboursement.
      </p>

      <h2>9. Données personnelles</h2>
      <p>
        Les données collectées lors de la commande sont nécessaires à son traitement
        et à sa livraison. Leur utilisation est décrite dans la{" "}
        <a href="/confidentialite">politique de confidentialité</a>.
      </p>

      <h2>10. Médiation et litiges</h2>
      <p>
        En cas de litige non résolu à l&apos;amiable, le client peut recourir
        gratuitement au médiateur de la consommation dont relève la boutique :{" "}
        <Mediator settings={settings} />. Le client peut également utiliser la
        plateforme européenne de règlement en ligne des litiges. Les présentes CGV
        sont soumises au droit français.
      </p>
    </>
  );
}
