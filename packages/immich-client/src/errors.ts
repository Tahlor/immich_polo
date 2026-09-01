export class ImmichIntegrationNotVerifiedError extends Error {
  constructor() {
    super(
      "Immich HTTP integration is intentionally not wired yet. Complete the real-server contract work in GitHub issue #1 before implementing endpoint-specific behavior.",
    );
    this.name = "ImmichIntegrationNotVerifiedError";
  }
}
