export class AIProviderError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly provider: string;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      provider?: string;
    } = {}
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = options.code || 'AI_PROVIDER_ERROR';
    this.statusCode = options.statusCode ?? 502;
    this.retryable = options.retryable ?? false;
    this.provider = options.provider || 'unknown';
  }
}

export class ProviderConfigurationError extends AIProviderError {
  constructor(message: string, provider = 'config') {
    super(message, {
      code: 'PROVIDER_NOT_CONFIGURED',
      statusCode: 400,
      retryable: false,
      provider,
    });
    this.name = 'ProviderConfigurationError';
  }
}

export class ProviderCapabilityError extends AIProviderError {
  constructor(message: string, provider: string) {
    super(message, {
      code: 'PROVIDER_CAPABILITY_UNSUPPORTED',
      statusCode: 400,
      retryable: false,
      provider,
    });
    this.name = 'ProviderCapabilityError';
  }
}

export class ProviderTimeoutError extends AIProviderError {
  constructor(message: string, provider: string) {
    super(message, {
      code: 'PROVIDER_TIMEOUT',
      statusCode: 504,
      retryable: true,
      provider,
    });
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderUnavailableError extends AIProviderError {
  constructor(message: string, provider: string, retryable = true) {
    super(message, {
      code: 'PROVIDER_UNAVAILABLE',
      statusCode: 503,
      retryable,
      provider,
    });
    this.name = 'ProviderUnavailableError';
  }
}

export class SchemaValidationError extends AIProviderError {
  constructor(message: string, provider: string) {
    super(message, {
      code: 'SCHEMA_VALIDATION_FAILED',
      statusCode: 502,
      retryable: true,
      provider,
    });
    this.name = 'SchemaValidationError';
  }
}
