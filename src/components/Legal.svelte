<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { ISSUES_URL, LEGAL } from '../lib/legal';

  let { page }: { page: 'impressum' | 'privacy' } = $props();

  const address = [LEGAL.street, LEGAL.postcodeCity].filter((l) => l.trim());
  const updated = $derived(new Date(LEGAL.updated).toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric' }));
</script>

{#snippet contact()}
  <p>
    {LEGAL.name}<br />
    {#if address.length}{#each address as line, i (i)}{line}<br />{/each}{LEGAL.country}<br />{/if}
    {#if LEGAL.email}
      {i18n.locale === 'de' ? 'E-Mail' : 'Email'}: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
    {:else}
      {i18n.locale === 'de' ? 'Kontakt' : 'Contact'}:
      <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">{i18n.locale === 'de' ? 'GitHub-Issues' : 'GitHub issues'}</a>
    {/if}
  </p>
{/snippet}

<article class="card legal">
  <p class="no-print"><button class="link" onclick={() => (location.hash = '')}>← {t('legal.back')}</button></p>

  {#if page === 'impressum'}
    {#if i18n.locale === 'de'}
      <h2>Impressum</h2>
      <h3>Angaben gemäß § 5 DDG</h3>
      {@render contact()}
      <p>Privates, nicht-kommerzielles Projekt. Die Berechnungen sind eine Planungshilfe ohne Gewähr – bitte Maße und Traglasten vor dem Kauf selbst prüfen.</p>
    {:else}
      <h2>Legal notice</h2>
      <h3>Information pursuant to § 5 DDG (German Digital Services Act)</h3>
      {@render contact()}
      <p>A private, non-commercial project. The results are a planning aid without warranty — please check dimensions and load ratings yourself before buying.</p>
    {/if}
  {:else if i18n.locale === 'de'}
    <h2>Datenschutzerklärung</h2>

    <h3>1. Verantwortlicher</h3>
    {@render contact()}

    <h3>2. Kurz gesagt</h3>
    <p>
      Der Rechner läuft vollständig in deinem Browser. Es gibt kein Benutzerkonto, keine Cookies und kein Tracking.
      Deine Eingaben (Regalmaße, Boxen, Preise) werden nicht an uns übertragen.
    </p>

    <h3>3. Hosting durch Cloudflare</h3>
    <p>
      Die Website wird über Cloudflare Pages ausgeliefert. Anbieter ist die Cloudflare, Inc., 101 Townsend St.,
      San Francisco, CA 94107, USA. Beim Aufruf der Seite verarbeitet Cloudflare technisch notwendige Verbindungsdaten
      (IP-Adresse, Datum und Uhrzeit, aufgerufene Datei, Browser-Kennung), um die Seite auszuliefern und vor Angriffen zu
      schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist eine sichere und
      zuverlässige Bereitstellung der Website. Cloudflare verarbeitet die Daten als Auftragsverarbeiter auf Grundlage
      seines Data Processing Addendum. Eine Übermittlung in die USA ist möglich; Cloudflare ist unter dem
      EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO). Weitere Informationen:
      <a href="https://www.cloudflare.com/de-de/privacypolicy/" target="_blank" rel="noopener noreferrer">Datenschutzerklärung von Cloudflare</a>.
    </p>

    {#if LEGAL.analytics}
      <h3>4. Reichweitenmessung</h3>
      <p>
        Wir nutzen Cloudflare Web Analytics, um zu sehen, wie oft der Rechner genutzt wird. Dabei werden keine Cookies
        gesetzt, keine Daten auf deinem Gerät gespeichert und keine Nutzerprofile erstellt; wir sehen nur zusammengefasste
        Zahlen (z. B. Seitenaufrufe, Herkunftsland, Browsertyp). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser
        berechtigtes Interesse ist die Verbesserung des Angebots.
      </p>
    {/if}

    <h3>{LEGAL.analytics ? 5 : 4}. Speicherung in deinem Browser</h3>
    <p>
      Damit deine Eingaben beim nächsten Besuch noch da sind, speichert der Rechner dein aktuelles Projekt und die
      gewählte Sprache im lokalen Speicher deines Browsers (localStorage). Diese Daten verlassen dein Gerät nicht.
      Die Speicherung ist für die von dir gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).
      Du kannst sie jederzeit über „Neu beginnen“ oder durch Löschen der Websitedaten in deinem Browser entfernen.
    </p>

    <h3>{LEGAL.analytics ? 6 : 5}. Export und Teilen</h3>
    <p>
      Beim JSON-Export wird eine Datei nur auf deinem Gerät gespeichert. Beim Teilen wird dein Projekt in den Link
      hinter dem „#“ geschrieben. Dieser Teil wird von Browsern nicht an den Server gesendet – aber jede Person, die den
      Link erhält, kann das Projekt sehen. Für den Versand des Links (z. B. per Messenger) gelten die Datenschutzbestimmungen
      des jeweiligen Dienstes.
    </p>

    <h3>{LEGAL.analytics ? 7 : 6}. Externe Links</h3>
    <p>
      Links zu anderen Websites (z. B. Produktseiten, Hugging Face, GitHub) werden erst beim Anklicken geöffnet. Ab dann
      gelten die Datenschutzbestimmungen der jeweiligen Anbieter. Die Seite lädt keine Schriften, Skripte oder Inhalte
      von Drittanbietern.
    </p>

    <h3>{LEGAL.analytics ? 8 : 7}. Deine Rechte</h3>
    <p>
      Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
      Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage von
      Art. 6 Abs. 1 lit. f (Art. 21). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren
      (Art. 77 DSGVO). Wende dich dazu an den oben genannten Kontakt.
    </p>

    <p class="muted">Stand: {updated}</p>
  {:else}
    <h2>Privacy notice</h2>

    <h3>1. Controller</h3>
    {@render contact()}

    <h3>2. In short</h3>
    <p>
      The calculator runs entirely in your browser. There are no user accounts, no cookies and no tracking. What you
      enter (shelf dimensions, boxes, prices) is not sent to us.
    </p>

    <h3>3. Hosting by Cloudflare</h3>
    <p>
      The website is served by Cloudflare Pages, provided by Cloudflare, Inc., 101 Townsend St., San Francisco,
      CA 94107, USA. When you open the site, Cloudflare processes technically necessary connection data (IP address,
      date and time, requested file, browser identifier) to deliver the site and protect it against attacks. The legal
      basis is Art. 6(1)(f) GDPR; our legitimate interest is providing the website securely and reliably. Cloudflare
      acts as a processor under its Data Processing Addendum. Data may be transferred to the USA; Cloudflare is
      certified under the EU-US Data Privacy Framework (Art. 45 GDPR). More information:
      <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare privacy policy</a>.
    </p>

    {#if LEGAL.analytics}
      <h3>4. Usage statistics</h3>
      <p>
        We use Cloudflare Web Analytics to see how often the calculator is used. It sets no cookies, stores nothing on
        your device and builds no user profiles; we only see aggregated numbers (e.g. page views, country, browser type).
        The legal basis is Art. 6(1)(f) GDPR; our legitimate interest is improving the tool.
      </p>
    {/if}

    <h3>{LEGAL.analytics ? 5 : 4}. Storage in your browser</h3>
    <p>
      So that your input is still there next time, the calculator stores your current project and your language choice
      in your browser's local storage (localStorage). This data never leaves your device. Storing it is strictly
      necessary for the function you asked for (§ 25(2) no. 2 TDDDG). You can remove it at any time with "Start over"
      or by clearing this site's data in your browser.
    </p>

    <h3>{LEGAL.analytics ? 6 : 5}. Export and sharing</h3>
    <p>
      JSON export saves a file on your device only. When you share, your project is written into the link after the
      "#". Browsers do not send this part to the server — but anyone who receives the link can see the project. Sending
      the link (e.g. by messenger) is subject to that service's privacy terms.
    </p>

    <h3>{LEGAL.analytics ? 7 : 6}. External links</h3>
    <p>
      Links to other websites (e.g. product pages, Hugging Face, GitHub) only open when you click them; from then on,
      that provider's privacy terms apply. The site does not load fonts, scripts or content from third parties.
    </p>

    <h3>{LEGAL.analytics ? 8 : 7}. Your rights</h3>
    <p>
      You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of
      processing (Art. 18), data portability (Art. 20) and to object to processing based on Art. 6(1)(f) (Art. 21).
      You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR). Use the contact
      above.
    </p>

    <p class="muted">Last updated: {updated}</p>
  {/if}
</article>

<style>
  .legal { max-width: 46rem; margin: 0 auto; display: grid; gap: 0.75rem; }
  .legal h2 { font-size: 1.3rem; }
  .legal h3 { font-size: 1rem; margin-top: 0.5rem; }
  .legal p { line-height: 1.55; }
</style>
