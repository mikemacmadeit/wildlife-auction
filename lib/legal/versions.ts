export const LEGAL_VERSIONS = {
  tos: {
    version: '2026-01-19',
    effectiveDateLabel: 'January 19, 2026',
  },
  marketplacePolicies: {
    version: '2026-01-19',
    effectiveDateLabel: 'January 19, 2026',
  },
  buyerAcknowledgment: {
    version: '2026-01-19',
    effectiveDateLabel: 'January 19, 2026',
  },
  sellerPolicy: {
    version: '2026-01-19',
    effectiveDateLabel: 'January 19, 2026',
  },
} as const;

export type LegalDocKey = keyof typeof LEGAL_VERSIONS;
