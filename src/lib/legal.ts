// Details for the Impressum (legal notice) and privacy page.
// An Impressum (§ 5 DDG) needs full name, a postal address where you can be served (no P.O. box)
// and a way to contact you quickly (email). The Impressum link only appears once street,
// postcode/city and email are filled in; until then the privacy page points to GitHub issues.

export const LEGAL = {
  name: 'Christian Kockler',
  street: '', // e.g. 'Musterstraße 1'
  postcodeCity: '', // e.g. '12345 Musterstadt'
  country: 'Deutschland',
  email: '',
  /** Set to true once Cloudflare Web Analytics is enabled for the site. */
  analytics: false,
  /** Date of the privacy notice. */
  updated: '2026-09-18',
};

export const REPO_URL = 'https://github.com/chkockle/eurobox-calculator';
export const ISSUES_URL = `${REPO_URL}/issues`;

export const HAS_IMPRINT = !!(LEGAL.street.trim() && LEGAL.postcodeCity.trim() && LEGAL.email.trim());
