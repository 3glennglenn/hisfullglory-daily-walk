export interface Capabilities {
  circles: boolean;
  aiStudy: false; premiumBilling: false; churchProBilling: false;
  creatorMonetization: false; externalCommunityImport: false; trustedContributorVerification: false;
  licensedBibleTranslations: boolean;
  productionGivingPayments: boolean;
  personToPersonSupport: boolean;
  nativePush: boolean;
  googleAuth: boolean;
  appleAuth: boolean;
  externalCharityGiving: boolean;
  community: boolean;
}
export function detectCapabilities(community: boolean): Capabilities {
  return {
    aiStudy: false, premiumBilling: false, churchProBilling: false,
    creatorMonetization: false, externalCommunityImport: false, trustedContributorVerification: false,
    community,
    circles: community,
    personToPersonSupport: community,
    externalCharityGiving: true,
    licensedBibleTranslations: false,
    productionGivingPayments: false,
    nativePush: false,
    googleAuth: false,
    appleAuth: false,
  };
}
export interface PaymentGates {
  serverCredentials: boolean;
  verifiedWebhooks: boolean;
  verifiedRecipient: boolean;
  legalApproval: boolean;
  productionFlag: boolean;
}
export const nativeGivingAllowed = (g: PaymentGates) =>
  Object.values(g).length === 5 &&
  g.serverCredentials &&
  g.verifiedWebhooks &&
  g.verifiedRecipient &&
  g.legalApproval &&
  g.productionFlag;
