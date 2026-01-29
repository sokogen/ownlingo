# OwnLingo

Shopify content translation system with AI provider integration.

## Features

### Settings Management (ol-007)

Comprehensive settings management for multi-provider AI translation:

- **API Key Management**: Securely store and manage API keys for multiple providers (OpenAI, Anthropic, Google)
- **Default Provider Selection**: Set a default AI provider for translations
- **Language Configuration**: Configure source and target languages
- **Translation Preferences**: Set tone and formality preferences for translations

#### API Key Validation

The system validates API keys for each provider:

- **OpenAI**: Keys must start with `sk-`
- **Anthropic**: Keys must start with `sk-ant-`
- **Google**: Keys must be at least 10 characters

#### Usage Example

```typescript
import { PrismaClient } from '@prisma/client';
import { SettingsService } from './src';

const prisma = new PrismaClient();
const settingsService = new SettingsService(prisma);

// Get shop settings
const settings = await settingsService.getShopSettings('shop-id');

// Update provider settings
await settingsService.updateProviderSettings({
  shopId: 'shop-id',
  provider: 'openai',
  apiKey: 'sk-your-openai-key',
  model: 'gpt-4',
  isDefault: true,
});

// Update translation preferences
await settingsService.updatePreferences({
  shopId: 'shop-id',
  tone: 'professional',
  formality: 'formal',
});

// Get default provider
const defaultProvider = await settingsService.getDefaultProvider('shop-id');
```

## Development

### Setup

```bash
npm install
npm run db:generate
```

### Testing

```bash
npm test
```

### Database Migrations

```bash
npm run db:migrate
npm run db:push
```

## Database Schema

The settings system uses the following models:

- **Shop**: Main shop configuration with translation preferences
- **AIProviderConfig**: API keys and settings for AI providers (supports multiple providers per shop)
- **Language**: Supported languages with source/target configuration

## License

ISC
