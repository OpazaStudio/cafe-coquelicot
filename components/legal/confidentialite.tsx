import type { Settings } from "@/lib/settings";
import { ManageCookiesButton } from "@/components/consent/manage-cookies-button";
import { LegalNav, ShopAddress, ShopEmail, ShopName } from "./legal-page";

export function ConfidentialiteContent({ settings }: { settings: Settings }) {
  return (
    <>
      <LegalNav current="/confidentialite" />
      <p className="legal__intro">
        Cette page décrit les données personnelles que nous collectons sur ce site,
        ce que nous en faisons et vos droits, conformément au Règlement général sur
        la protection des données (RGPD) et à la loi Informatique et Libertés.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        <ShopName settings={settings} />, <ShopAddress settings={settings} />.
        Contact : <ShopEmail settings={settings} />.
      </p>

      <h2>Données collectées et finalités</h2>
      <dl className="legal__facts">
        <dt>Commande</dt>
        <dd>
          Nom, e-mail, téléphone, point relais choisi ou adresse de livraison, date de livraison souhaitée,
          message de carte, détail de la commande. Finalité : exécution du contrat
          (préparation, expédition, suivi, service après-vente) et obligations
          comptables. Conservation : dix ans pour les pièces comptables.
        </dd>
        <dt>Paiement</dt>
        <dd>
          Les données bancaires sont saisies directement chez Stripe et ne nous sont
          jamais transmises. Nous ne conservons qu&apos;un identifiant de transaction.
        </dd>
        <dt>Formulaire de contact</dt>
        <dd>
          Nom, e-mail, téléphone et message. Finalité : répondre à votre demande.
          Conservation : le temps du traitement, puis trois ans au plus.
        </dd>
        <dt>Mesure d&apos;audience</dt>
        <dd>
          Avec votre accord uniquement : pages vues, produits ajoutés au panier,
          commandes, sous forme de statistiques agrégées. Conservation : quatorze
          mois au plus.
        </dd>
      </dl>

      <h2>Base légale</h2>
      <p>
        L&apos;exécution du contrat pour les commandes, notre intérêt légitime à
        répondre à vos messages pour le formulaire de contact, et votre consentement
        pour la mesure d&apos;audience.
      </p>

      <h2>Destinataires et sous-traitants</h2>
      <ul>
        <li>Stripe Payments Europe Ltd (Irlande) : paiement sécurisé.</li>
        <li>Mondial Relay (France) : livraison, notification de disponibilité du colis.</li>
        <li>La Poste / Colissimo (France) : livraison à domicile et suivi du colis.</li>
        <li>Resend Inc. (États-Unis, clauses contractuelles types) : envoi des e-mails du formulaire de contact.</li>
        <li>Supabase Inc. (données hébergées dans l&apos;Union européenne) : base de données et stockage des images.</li>
        <li>Vercel Inc. (États-Unis, clauses contractuelles types) : hébergement du site.</li>
        <li>Google Ireland Ltd : Google Analytics 4, uniquement si vous l&apos;acceptez.</li>
      </ul>
      <p>Nous ne vendons ni ne louons vos données à des tiers.</p>

      <h2>Cookies</h2>
      <p>
        Le site fonctionne sans cookie publicitaire. Le panier et votre choix de
        consentement sont mémorisés dans le stockage local de votre navigateur,
        sans transmission à un tiers. Un cookie de mesure d&apos;audience (Google
        Analytics) est déposé seulement si vous l&apos;acceptez via le bandeau ; le
        refus n&apos;empêche rien. Vous pouvez changer d&apos;avis à tout moment :{" "}
        <ManageCookiesButton />
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
        de limitation, d&apos;opposition et de portabilité de vos données, ainsi que du
        droit de retirer votre consentement à tout moment. Pour l&apos;exercer,
        écrivez-nous à <ShopEmail settings={settings} />. Vous pouvez aussi introduire
        une réclamation auprès de la CNIL (
        <a href="https://www.cnil.fr" rel="noopener noreferrer" target="_blank">
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>Sécurité</h2>
      <p>
        Le site est servi en HTTPS. L&apos;accès au back-office est protégé par mot de
        passe et limité aux personnes habilitées. Les paiements sont traités par un
        prestataire certifié PCI DSS.
      </p>
    </>
  );
}
