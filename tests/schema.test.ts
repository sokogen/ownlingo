import 'dotenv/config';
import { PrismaClient, TranslationStatus, JobStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

describe('Database Schema CRUD Operations', () => {
  let shopId: string;
  let languageId: string;
  let contentHashId: string;
  let translationId: string;
  let translationJobId: string;
  let aiProviderConfigId: string;

  beforeAll(async () => {
    // Clean up test data before running tests
    await prisma.translation.deleteMany({});
    await prisma.translationJob.deleteMany({});
    await prisma.contentHash.deleteMany({});
    await prisma.aIProviderConfig.deleteMany({});
    await prisma.language.deleteMany({});
    await prisma.shop.deleteMany({});
  });

  afterAll(async () => {
    // Clean up test data after tests
    await prisma.translation.deleteMany({});
    await prisma.translationJob.deleteMany({});
    await prisma.contentHash.deleteMany({});
    await prisma.aIProviderConfig.deleteMany({});
    await prisma.language.deleteMany({});
    await prisma.shop.deleteMany({});
    await prisma.$disconnect();
    await pool.end();
  });

  describe('Shop CRUD', () => {
    it('should create a shop', async () => {
      const shop = await prisma.shop.create({
        data: {
          domain: 'test-store.myshopify.com',
        },
      });
      expect(shop).toBeDefined();
      expect(shop.domain).toBe('test-store.myshopify.com');
      shopId = shop.id;
    });

    it('should read a shop', async () => {
      const shop = await prisma.shop.findUnique({
        where: { id: shopId },
      });
      expect(shop).toBeDefined();
      expect(shop?.domain).toBe('test-store.myshopify.com');
    });

    it('should update a shop', async () => {
      const shop = await prisma.shop.update({
        where: { id: shopId },
        data: { domain: 'updated-store.myshopify.com' },
      });
      expect(shop.domain).toBe('updated-store.myshopify.com');
    });
  });

  describe('Language CRUD', () => {
    it('should create a language', async () => {
      const language = await prisma.language.create({
        data: {
          shopId,
          locale: 'en',
          name: 'English',
          isDefault: true,
        },
      });
      expect(language).toBeDefined();
      expect(language.locale).toBe('en');
      languageId = language.id;
    });

    it('should read languages for a shop', async () => {
      const languages = await prisma.language.findMany({
        where: { shopId },
      });
      expect(languages).toHaveLength(1);
      expect(languages[0].locale).toBe('en');
    });

    it('should update a language', async () => {
      const language = await prisma.language.update({
        where: { id: languageId },
        data: { isEnabled: false },
      });
      expect(language.isEnabled).toBe(false);
    });
  });

  describe('ContentHash CRUD', () => {
    it('should create a content hash', async () => {
      const contentHash = await prisma.contentHash.create({
        data: {
          shopId,
          resourceType: 'product',
          resourceId: 'gid://shopify/Product/123',
          fieldName: 'title',
          hash: 'abc123hash',
          content: 'Original Product Title',
        },
      });
      expect(contentHash).toBeDefined();
      expect(contentHash.hash).toBe('abc123hash');
      contentHashId = contentHash.id;
    });

    it('should read a content hash', async () => {
      const contentHash = await prisma.contentHash.findUnique({
        where: { id: contentHashId },
      });
      expect(contentHash).toBeDefined();
      expect(contentHash?.content).toBe('Original Product Title');
    });

    it('should update a content hash', async () => {
      const contentHash = await prisma.contentHash.update({
        where: { id: contentHashId },
        data: {
          hash: 'newHash456',
          content: 'Updated Product Title',
        },
      });
      expect(contentHash.hash).toBe('newHash456');
    });
  });

  describe('TranslationJob CRUD', () => {
    it('should create a translation job', async () => {
      const job = await prisma.translationJob.create({
        data: {
          shopId,
          totalItems: 10,
          resourceTypes: ['product', 'collection'],
          targetLocales: ['fr', 'de'],
        },
      });
      expect(job).toBeDefined();
      expect(job.status).toBe(JobStatus.QUEUED);
      translationJobId = job.id;
    });

    it('should read a translation job', async () => {
      const job = await prisma.translationJob.findUnique({
        where: { id: translationJobId },
      });
      expect(job).toBeDefined();
      expect(job?.totalItems).toBe(10);
    });

    it('should update a translation job status', async () => {
      const job = await prisma.translationJob.update({
        where: { id: translationJobId },
        data: {
          status: JobStatus.IN_PROGRESS,
          startedAt: new Date(),
          completedItems: 3,
        },
      });
      expect(job.status).toBe(JobStatus.IN_PROGRESS);
      expect(job.completedItems).toBe(3);
    });
  });

  describe('Translation CRUD', () => {
    it('should create a translation', async () => {
      // First create a target language
      const frenchLang = await prisma.language.create({
        data: {
          shopId,
          locale: 'fr',
          name: 'French',
        },
      });

      const translation = await prisma.translation.create({
        data: {
          shopId,
          languageId: frenchLang.id,
          contentHashId,
          translatedText: 'Titre du produit traduit',
          status: TranslationStatus.COMPLETED,
          aiProvider: 'openai',
          aiModel: 'gpt-4',
          tokensUsed: 150,
          translationJobId,
        },
      });
      expect(translation).toBeDefined();
      expect(translation.status).toBe(TranslationStatus.COMPLETED);
      translationId = translation.id;
    });

    it('should read a translation', async () => {
      const translation = await prisma.translation.findUnique({
        where: { id: translationId },
        include: {
          language: true,
          contentHash: true,
        },
      });
      expect(translation).toBeDefined();
      expect(translation?.language.locale).toBe('fr');
      expect(translation?.contentHash.resourceType).toBe('product');
    });

    it('should update a translation', async () => {
      const translation = await prisma.translation.update({
        where: { id: translationId },
        data: {
          status: TranslationStatus.NEEDS_REVIEW,
        },
      });
      expect(translation.status).toBe(TranslationStatus.NEEDS_REVIEW);
    });
  });

  describe('AIProviderConfig CRUD', () => {
    it('should create an AI provider config', async () => {
      const config = await prisma.aIProviderConfig.create({
        data: {
          shopId,
          provider: 'openai',
          apiKey: 'encrypted-api-key-here',
          model: 'gpt-4',
          maxTokens: 4096,
          temperature: 0.7,
        },
      });
      expect(config).toBeDefined();
      expect(config.provider).toBe('openai');
      aiProviderConfigId = config.id;
    });

    it('should read AI provider config for a shop', async () => {
      const config = await prisma.aIProviderConfig.findUnique({
        where: { shopId },
      });
      expect(config).toBeDefined();
      expect(config?.model).toBe('gpt-4');
    });

    it('should update AI provider config', async () => {
      const config = await prisma.aIProviderConfig.update({
        where: { id: aiProviderConfigId },
        data: {
          model: 'gpt-4-turbo',
          temperature: 0.5,
        },
      });
      expect(config.model).toBe('gpt-4-turbo');
      expect(config.temperature).toBe(0.5);
    });
  });

  describe('Delete operations', () => {
    it('should delete a translation', async () => {
      await prisma.translation.delete({
        where: { id: translationId },
      });
      const translation = await prisma.translation.findUnique({
        where: { id: translationId },
      });
      expect(translation).toBeNull();
    });

    it('should cascade delete when shop is deleted', async () => {
      // Count records before deletion
      const languagesBefore = await prisma.language.count({ where: { shopId } });
      expect(languagesBefore).toBeGreaterThan(0);

      // Delete the shop
      await prisma.shop.delete({
        where: { id: shopId },
      });

      // Verify cascade deletion
      const languagesAfter = await prisma.language.count({ where: { shopId } });
      expect(languagesAfter).toBe(0);

      const contentHashesAfter = await prisma.contentHash.count({ where: { shopId } });
      expect(contentHashesAfter).toBe(0);
    });
  });
});
