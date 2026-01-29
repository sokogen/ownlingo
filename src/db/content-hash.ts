import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { TranslatableResource } from '../shopify/fetcher';

export class ContentHashRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create SHA-256 hash of content
   */
  private createContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Store or update content hash for a resource field
   */
  async upsertContentHash(
    shopId: string,
    resourceType: string,
    resourceId: string,
    fieldName: string,
    content: string
  ): Promise<{ id: string; hash: string; isNew: boolean; hasChanged: boolean }> {
    const hash = this.createContentHash(content);

    // Check if content hash already exists
    const existing = await this.prisma.contentHash.findUnique({
      where: {
        shopId_resourceType_resourceId_fieldName: {
          shopId,
          resourceType,
          resourceId,
          fieldName,
        },
      },
    });

    if (existing) {
      const hasChanged = existing.hash !== hash;

      if (hasChanged) {
        // Content has changed - update the hash and content
        const updated = await this.prisma.contentHash.update({
          where: { id: existing.id },
          data: {
            hash,
            content,
            updatedAt: new Date(),
          },
        });

        return {
          id: updated.id,
          hash: updated.hash,
          isNew: false,
          hasChanged: true,
        };
      }

      // Content hasn't changed
      return {
        id: existing.id,
        hash: existing.hash,
        isNew: false,
        hasChanged: false,
      };
    }

    // Create new content hash
    const created = await this.prisma.contentHash.create({
      data: {
        shopId,
        resourceType,
        resourceId,
        fieldName,
        hash,
        content,
      },
    });

    return {
      id: created.id,
      hash: created.hash,
      isNew: true,
      hasChanged: false,
    };
  }

  /**
   * Store translatable resources from Shopify
   */
  async storeTranslatableResources(
    shopId: string,
    resources: TranslatableResource[]
  ): Promise<{
    totalProcessed: number;
    newContent: number;
    changedContent: number;
    unchangedContent: number;
  }> {
    let totalProcessed = 0;
    let newContent = 0;
    let changedContent = 0;
    let unchangedContent = 0;

    for (const resource of resources) {
      for (const content of resource.translatableContent) {
        const result = await this.upsertContentHash(
          shopId,
          resource.resourceType.toLowerCase(),
          resource.resourceId,
          content.key,
          content.value
        );

        totalProcessed++;

        if (result.isNew) {
          newContent++;
        } else if (result.hasChanged) {
          changedContent++;
        } else {
          unchangedContent++;
        }
      }
    }

    return {
      totalProcessed,
      newContent,
      changedContent,
      unchangedContent,
    };
  }

  /**
   * Get all content hashes for a shop
   */
  async getContentHashesByShop(
    shopId: string,
    resourceType?: string
  ): Promise<Array<{
    id: string;
    resourceType: string;
    resourceId: string;
    fieldName: string;
    hash: string;
    content: string;
  }>> {
    const where: any = { shopId };
    if (resourceType) {
      where.resourceType = resourceType;
    }

    return this.prisma.contentHash.findMany({
      where,
      select: {
        id: true,
        resourceType: true,
        resourceId: true,
        fieldName: true,
        hash: true,
        content: true,
      },
      orderBy: [
        { resourceType: 'asc' },
        { resourceId: 'asc' },
        { fieldName: 'asc' },
      ],
    });
  }

  /**
   * Check if content has changed since last fetch
   */
  async hasContentChanged(
    shopId: string,
    resourceType: string,
    resourceId: string,
    fieldName: string,
    newContent: string
  ): Promise<boolean> {
    const existing = await this.prisma.contentHash.findUnique({
      where: {
        shopId_resourceType_resourceId_fieldName: {
          shopId,
          resourceType,
          resourceId,
          fieldName,
        },
      },
    });

    if (!existing) {
      return true; // New content
    }

    const newHash = this.createContentHash(newContent);
    return existing.hash !== newHash;
  }
}
