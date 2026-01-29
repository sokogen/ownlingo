// GraphQL mutations for pushing translations to Shopify

/**
 * Register translations for a resource
 * This is the primary mutation for pushing translations to Shopify
 */
export const TRANSLATIONS_REGISTER_MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        message
        field
      }
      translations {
        key
        value
        locale
        outdated
        updatedAt
      }
    }
  }
`;

/**
 * Remove translations for a resource
 */
export const TRANSLATIONS_REMOVE_MUTATION = `
  mutation translationsRemove($resourceId: ID!, $translationKeys: [String!]!, $locales: [String!]!) {
    translationsRemove(resourceId: $resourceId, translationKeys: $translationKeys, locales: $locales) {
      userErrors {
        message
        field
      }
      translations {
        key
        locale
      }
    }
  }
`;
