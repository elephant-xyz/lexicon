SELECT
  contractVersion,
  evidenceId,
  acquisitionId,
  operationRequestId,
  runId,
  requestId,
  lookupAddress,
  lookupCanonicalKey,
  registrationId,
  registrationVersion,
  publisherId,
  sourceUrl,
  retrievedAt,
  sourcePublishedAt,
  httpStatus,
  retrievalOutcome,
  evidenceKind,
  exactPropertyMatch,
  indexCompletenessVerified,
  listingStatus,
  rawStatus,
  askingPriceAmountMinor,
  askingPriceCurrency,
  askingPriceParseStatus,
  mlsId,
  evidenceExcerpt,
  primaryRawArtifactUri,
  primaryRawArtifactSha256,
  provenanceJson,
  acquisitionRecordSha256,
  extractionJson
FROM target_normalized_evidence
WHERE
  retrievalOutcome = 'SUCCESS'
  AND evidenceKind = 'exact_listing'
  AND exactPropertyMatch = TRUE
