import './transcript-logic.js';

const api = globalThis.MirzaTranscript;

export const normalizeForComparison = api.normalizeForComparison;
export const wordsMatch = api.wordsMatch;
export const isTruncatedStem = api.isTruncatedStem;
export const lcsWordMatchCount = api.lcsWordMatchCount;
export const classifyTextRelationship = api.classifyTextRelationship;
export const mergeConsecutiveTexts = api.mergeConsecutiveTexts;
export const mergeCaptionMessages = api.mergeCaptionMessages;
export const deduplicateMeetingMessages = api.deduplicateMeetingMessages;
