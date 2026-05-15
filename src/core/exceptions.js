export class GeminiError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends GeminiError {}

export class APIError extends GeminiError {
  constructor(message, errorCode = null) {
    super(message);
    this.errorCode = errorCode;
  }
}

export class UsageLimitExceeded extends GeminiError {}
export class ModelInvalid extends GeminiError {}
export class TemporarilyBlocked extends GeminiError {}
export class GeminiTimeoutError extends GeminiError {}

export class ImageGenerationError extends APIError {}
export class VideoGenerationError extends APIError {}
export class MusicGenerationError extends APIError {}
export class ResearchError extends APIError {}

export class ProfileError extends GeminiError {}
export class TokenFactoryError extends GeminiError {}
