/**
 * Narrative generator.
 * One-sentence summary from pillar scores.
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

  const fundamentalsWord = fundamentalsScore >= 60 ? 'Strong' : 'Weak';
  const momentumWord = momentumScore >= 60 ? 'strong' : 'weak';
  const balanceWord = balanceSheetScore >= 60 ? 'safe' : 'stressed';

  let action: string;
  if (compositeScore >= 85) action = 'aggressive buy';
  else if (compositeScore >= 70) action = 'core holding';
  else if (compositeScore >= 55) action = 'tactical / watch';
  else action = 'avoid / exit';

  const sentence = `${fundamentalsWord} fundamentals, ${momentumWord} momentum, ${balanceWord} balance sheet — ${action}.`;

  return { sentence, action, compositeScore };
}
