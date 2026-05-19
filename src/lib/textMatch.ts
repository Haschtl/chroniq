export const isExtraGuessCorrect = (type: string, value: string, expected: string) => {
  if (!value.trim()) return false;
  if (type === "number") return Number(value) === Number(expected);

  const normalizedValue = normalizeGuessText(value);
  const expectedVariants = getExpectedTextVariants(expected);
  if (!normalizedValue || expectedVariants.length === 0) return false;
  if (type === "text-exact") {
    const compactValue = compactText(normalizedValue);
    return expectedVariants.some((variant) => normalizedValue === variant || compactValue === compactText(variant));
  }

  return expectedVariants.some((variant) => isLooseTextMatch(normalizedValue, variant));
};

export const normalizeGuessText = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getExpectedTextVariants = (expected: string) => {
  const withoutBrackets = expected.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, " ");
  const candidates = [expected, withoutBrackets, ...withoutBrackets.split(/\s[-–—:]\s|\s\/\s/g)];
  return [...new Set(candidates.map(normalizeGuessText).filter(Boolean))];
};

const isLooseTextMatch = (value: string, expected: string) => {
  const compactValue = compactText(value);
  const compactExpected = compactText(expected);
  if (value === expected) return true;
  if (compactValue === compactExpected) return true;
  if (isMeaningfulSubstring(value, expected) || isMeaningfulSubstring(expected, value)) return true;
  if (isMeaningfulSubstring(compactValue, compactExpected) || isMeaningfulSubstring(compactExpected, compactValue)) return true;
  if (hasEnoughSharedWords(value, expected)) return true;
  return weightedSimilarity(compactValue, compactExpected) >= getSimilarityThreshold(compactValue, compactExpected);
};

const compactText = (value: string) => value.replace(/\s+/g, "");

const isMeaningfulSubstring = (part: string, whole: string) =>
  part.length >= 5 && whole.includes(part) && part.length / whole.length >= 0.55;

const hasEnoughSharedWords = (value: string, expected: string) => {
  const valueWords = value.split(" ").filter((word) => word.length > 2);
  const expectedWords = new Set(expected.split(" ").filter((word) => word.length > 2));
  if (valueWords.length === 0 || expectedWords.size === 0) return false;
  const shared = valueWords.filter((word) => expectedWords.has(word)).length;
  const valueCoverage = shared / valueWords.length;
  const expectedCoverage = shared / expectedWords.size;
  return valueCoverage >= 0.8 && expectedCoverage >= 0.45;
};

const weightedSimilarity = (left: string, right: string) => {
  const maxDistance = Math.max(weightedLength(left), weightedLength(right));
  if (maxDistance === 0) return 0;
  return 1 - weightedEditDistance(left, right) / maxDistance;
};

const weightedLength = (value: string) =>
  [...value].reduce((sum, _character, index) => sum + characterWeight(index), 0);

const weightedEditDistance = (left: string, right: string) => {
  const a = [...left];
  const b = [...right];
  const previous = Array.from({ length: b.length + 1 }, () => 0);
  for (let column = 1; column <= b.length; column += 1) previous[column] = previous[column - 1] + characterWeight(column - 1);

  for (let row = 1; row <= a.length; row += 1) {
    const current = Array.from({ length: b.length + 1 }, () => 0);
    current[0] = previous[0] + characterWeight(row - 1);
    for (let column = 1; column <= b.length; column += 1) {
      const deleteCost = previous[column] + characterWeight(row - 1);
      const insertCost = current[column - 1] + characterWeight(column - 1);
      const replaceCost = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : Math.max(characterWeight(row - 1), characterWeight(column - 1)));
      current[column] = Math.min(deleteCost, insertCost, replaceCost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
};

const characterWeight = (index: number) => Math.max(0.35, 1 - index * 0.035);

const getSimilarityThreshold = (value: string, expected: string) => {
  const shortest = Math.min(value.length, expected.length);
  if (shortest <= 4) return 0.92;
  if (shortest <= 8) return 0.86;
  return 0.8;
};
