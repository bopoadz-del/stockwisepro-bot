/**
 * Narrative generator.
 * One-sentence summary from pillar scores (0-100 scale).
 */

export interface NarrativeResult {
  sentence: string;
  action: string;
  compositeScore: number;
}

export function generateNarrative(
  fundamentalsScore: number,
  momentumScore: number,
  balanceSheetScore: number
): NarrativeResult {
  const compositeScore = Math.round(
    (fundamentalsScore + momentumScore + balanceSheetScore) / 3
  );

  const fundamentalsWord = fundamentalsScore >= 70 ? 'Strong' : fundamentalsScore < 50 ? 'Weak' : 'Moderate';
  const momentumWord = momentumScore >= 70 ? 'strong' : momentumScore < 50 ? 'weak' : 'moderate';
  const balanceWord = balanceSheetScore >= 70 ? 'safe' : balanceSheetScore < 50 ? 'stressed' : 'mixed';

  let action: string;
  if (compositeScore >= 85) action = 'aggressive buy';
  else if (compositeScore >= 70) action = 'core holding';
  else if (compositeScore >= 55) action = 'tactical / watch';
  else action = 'avoid / exit';

  const sentence = `${fundamentalsWord} fundamentals, ${momentumWord} momentum, ${balanceWord} balance sheet — ${action}.`;

  return { sentence, action, compositeScore };
}
