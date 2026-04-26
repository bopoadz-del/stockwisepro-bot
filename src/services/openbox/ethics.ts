/**
 * Ethics hard filter.
 * Rejects tickers based on boycott lists, sector ethics, and content.
 */

const ISRAELI_HARDCODED_LIST = new Set([
  'ICL', 'TEVA', 'NICE', 'CHKP', 'ZM', 'WIX', 'FROG', 'MNDY', 'GLBE', 'PERI',
]);

const ADULT_KEYWORDS = ['adult entertainment', 'pornography', 'cam sites', 'escort', 'onlyfans'];

const WEAPONS_KEYWORDS = ['weapons', 'munitions', 'ordnance', 'missile', 'tactical systems', 'military'];

const SECTOR_BLACKLIST = new Set([
  'casinos', 'distilleries', 'breweries', 'defense', 'aerospace',
]);

const ETHICS_PENALTY_WEIGHT = 25; // redistributed to other pillars

export interface EthicsResult {
  pass: boolean;
  violations: string[];
  redistributedWeight: number;
}

export function checkEthics(
  ticker: string,
  sector?: string,
  industry?: string,
  name?: string
): EthicsResult {
  const violations: string[] = [];
  const upperTicker = ticker.toUpperCase();
  const lowerSector = (sector || '').toLowerCase();
  const lowerIndustry = (industry || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  // (a) Hardcoded Israeli boycott list
  if (ISRAELI_HARDCODED_LIST.has(upperTicker)) {
    violations.push('Boycott list: Israeli-linked ticker');
  }

  // (b) Sector + name checks for defense/weapons and blacklisted sectors
  for (const badSector of SECTOR_BLACKLIST) {
    if (lowerSector.includes(badSector) || lowerIndustry.includes(badSector)) {
      // If sector is blacklisted AND name contains weapons/Israeli keywords
      const hasWeaponsLink = WEAPONS_KEYWORDS.some(k => lowerName.includes(k));
      const hasIsraeliLink = ISRAELI_HARDCODED_LIST.has(upperTicker) || lowerName.includes('israel') || lowerName.includes('israeli');
      if (hasWeaponsLink || hasIsraeliLink) {
        violations.push(`Blacklisted sector (${badSector}) with sensitive linkage`);
      }
    }
  }

  // (c) Adult entertainment
  if (ADULT_KEYWORDS.some(k => lowerName.includes(k) || lowerIndustry.includes(k) || lowerSector.includes(k))) {
    violations.push('Adult entertainment content');
  }

  const pass = violations.length === 0;

  return {
    pass,
    violations,
    redistributedWeight: pass ? 0 : ETHICS_PENALTY_WEIGHT,
  };
}
