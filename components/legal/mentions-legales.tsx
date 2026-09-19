import type { Settings } from "@/lib/settings";
import { LegalValue } from "./legal-value";
import { LegalNav, ShopAddress, ShopEmail, ShopName, ShopPhone } from "./legal-page";

export function MentionsLegalesContent({ settings }: { settings: Settings }) {
  const capital = settings.capital.trim();
  const vat = settings.vat_number.trim();
  return (
    <>
      <LegalNav current="/mentions-legales" />
      <p className="legal__intro">
        Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans
        l&apos;économie numérique, voici les informations relatives à l&apos;éditeur
        et à l&apos;hébergeur de ce site.
      </p>

      <h2>Éditeur du site</h2>
      <dl className="legal__facts">
        <dt>Dénomination</dt>
        <dd><ShopName settings={settings} /></dd>
        <dt>Forme juridique</dt>
        <dd><LegalValue value={settings.legal_form} label="forme juridique" /></dd>
        {capital ? (
          <>
            <dt>Capital social</dt>
            <dd>{capital}</dd>
          </>
        ) : null}
        <dt>SIRET</dt>
        <dd><LegalValue value={settings.siret} label="SIRET" /></dd>
        <dt>Immatriculation</dt>
        <dd><LegalValue value={settings.rcs} label="RCS / RM" /></dd>
        <dt>TVA intracommunautaire</dt>
        <dd>{vat ? vat : "TVA non applicable, art. 293 B du CGI"}</dd>
        <dt>Siège</dt>
        <dd><ShopAddress settings={settings} /></dd>
        <dt>Téléphone</dt>
        <dd><ShopPhone settings={settings} /></dd>
        <dt>E-mail</dt>
        <dd><ShopEmail settings={settings} /></dd>
        <dt>Directeur·rice de la publication</dt>
        <dd><LegalValue value={settings.publication_director} label="directeur de la publication" /></dd>
      </dl>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <LegalValue value={settings.host_name} label="hébergeur" />,{" "}
        <LegalValue value={settings.host_address} label="adresse de l'hébergeur" />.
      </p>
      <p>
        Les données (catalogue, commandes) sont stockées par Supabase Inc. sur des
        serveurs situés dans l&apos;Union européenne (région eu-west-1, Irlande).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L&apos;ensemble des contenus de ce site (textes, photographies, illustrations,
        logo, charte graphique) est la propriété de <ShopName settings={settings} /> ou
        de ses partenaires, et est protégé par le Code de la propriété intellectuelle.
        Toute reproduction ou représentation, totale ou partielle, sans autorisation
        écrite préalable est interdite.
      </p>

      <h2>Données personnelles et cookies</h2>
      <p>
        Les traitements de données personnelles et l&apos;usage des cookies sont
        détaillés dans notre <a href="/confidentialite">politique de confidentialité</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative au site : <ShopEmail settings={settings} />.
      </p>
    </>
  );
}
