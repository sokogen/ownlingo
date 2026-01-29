// GraphQL queries for fetching translatable content from Shopify

export const TRANSLATABLE_RESOURCES_QUERY = `
  query getTranslatableResources($resourceType: TranslatableResourceType!, $first: Int!, $after: String) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
      edges {
        node {
          resourceId
          translatableContent {
            key
            value
            digest
            locale
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const PRODUCT_DETAILS_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      description
      descriptionHtml
      metafields(first: 100) {
        edges {
          node {
            key
            namespace
            value
            type
          }
        }
      }
    }
  }
`;

export const COLLECTION_DETAILS_QUERY = `
  query getCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      description
      descriptionHtml
    }
  }
`;

export const PAGE_DETAILS_QUERY = `
  query getPage($id: ID!) {
    page(id: $id) {
      id
      title
      body
      bodySummary
    }
  }
`;

export const ARTICLE_DETAILS_QUERY = `
  query getArticle($id: ID!) {
    article(id: $id) {
      id
      title
      content
      contentHtml
      excerptHtml
    }
  }
`;

export const MENUS_QUERY = `
  query getMenus {
    shop {
      navigationMenus(first: 10) {
        edges {
          node {
            id
            title
            items {
              id
              title
              url
            }
          }
        }
      }
    }
  }
`;
