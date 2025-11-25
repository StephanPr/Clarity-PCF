import { IInputs, IOutputs } from "./generated/ManifestTypes";
import Clarity from "@microsoft/clarity";

// Explicit status for Clarity runtime
enum ClarityStatus {
  NotStarted = "NotStarted",
  Initialized = "Initialized",
  Error = "Error",
}

export class SCNClarityTracker
  implements ComponentFramework.StandardControl<IInputs, IOutputs>
{
  private context!: ComponentFramework.Context<IInputs>;
  private container!: HTMLDivElement;

  private baseMetadataSent = false;
  private sessionTagsApplied = false;

  private lastScreenName?: string;
  private lastEventTriggerToken?: number;

  private clarityProjectId?: string;
  private clarityStatus: ClarityStatus = ClarityStatus.NotStarted;
  private lastTrackingAllowed?: boolean;

  private readonly LOG_PREFIX = "[SCN.ClarityTracker]";

  constructor() {
    // PCF requires a parameterless constructor.
  }

  // ------------- lifecycle -------------

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    try {
      this.context = context;
      this.container = container;

      // Make the control invisible
      this.container.style.display = "none";

      this.clarityProjectId = context.parameters.clarityProjectId.raw ?? "";
      this.lastTrackingAllowed = this.isTrackingAllowed();

      const canTrack =
        this.isEnabled() &&
        this.lastTrackingAllowed === true &&
        !!this.clarityProjectId;

      if (canTrack && this.clarityProjectId) {
        this.initializeClarity(this.clarityProjectId);

        if (this.clarityStatus === ClarityStatus.Initialized) {
          this.sendBaseMetadataIfNeeded();
          this.applySessionTagsIfNeeded();
          this.updateScreenNameIfChanged();
        }
      }
    } catch (e: unknown) {
      console.error(
        `${this.LOG_PREFIX} Error in init:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    try {
      this.context = context;

      // Respect "disable" flag first
      if (!this.isEnabled()) {
        this.logDebug("Tracking disabled by flags; skipping.");
        return;
      }

      const projectId = context.parameters.clarityProjectId.raw ?? "";

      // Detect trackingAllowed changes and update consent
      const trackingAllowedNow = this.isTrackingAllowed();
      if (this.lastTrackingAllowed !== trackingAllowedNow) {
        this.logDebug(
          `trackingAllowed changed: ${this.lastTrackingAllowed} -> ${trackingAllowedNow}`
        );
        this.lastTrackingAllowed = trackingAllowedNow;

        if (this.clarityStatus === ClarityStatus.Initialized) {
          Clarity.consent(trackingAllowedNow);
        }
      }

      // If tracking is not allowed, do not initialize
      if (!trackingAllowedNow) {
        this.logDebug("Tracking not allowed; skipping init & events.");
        return;
      }

      // Initialize Clarity once projectId is available and not already used
      const shouldInit =
        !!projectId &&
        (this.clarityStatus !== ClarityStatus.Initialized ||
          this.clarityProjectId !== projectId);

      if (shouldInit) {
        this.clarityProjectId = projectId;
        this.initializeClarity(projectId);
      }

      if (this.clarityStatus !== ClarityStatus.Initialized) {
        this.logDebug("ClarityTracker not initialized yet (or in error).");
        return;
      }

      this.sendBaseMetadataIfNeeded();
      this.applySessionTagsIfNeeded();
      this.updateScreenNameIfChanged();
      this.processEventIfTriggered();
    } catch (e: unknown) {
      console.error(
        `${this.LOG_PREFIX} Error in updateView:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  public getOutputs(): IOutputs {
    // No outputs used; events are one-way into Clarity
    return {};
  }

  public destroy(): void {
    // Do NOT tear down Clarity; we want it for the whole browser tab session
  }

  // ------------- clarity bootstrap -------------

  private initializeClarity(projectId: string): void {
    this.logDebug("Clarity init started.");

    if (!projectId || projectId.trim() === "") {
      this.logDebug("No projectId provided; skipping Clarity.init");
      return;
    }

    if (
      this.clarityStatus === ClarityStatus.Initialized &&
      this.clarityProjectId === projectId
    ) {
      this.logDebug(
        "Clarity already initialized with this projectId; skipping."
      );
      return;
    }

    try {
      Clarity.init(projectId);

      // Clarity consent
      const trackingAllowed = this.isTrackingAllowed();
      Clarity.consent(trackingAllowed);
      this.lastTrackingAllowed = trackingAllowed;

      this.clarityProjectId = projectId;
      this.clarityStatus = ClarityStatus.Initialized;

      this.logDebug(
        `Clarity initialized via package with project id: ${projectId}, consent=${trackingAllowed}`
      );
    } catch (e: unknown) {
      this.clarityStatus = ClarityStatus.Error;
      console.error(
        `${this.LOG_PREFIX} Failed to initialize Clarity:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  // ------------- metadata & tags -------------

  private sendBaseMetadataIfNeeded(): void {
    if (this.baseMetadataSent) {
      return;
    }
    if (this.clarityStatus !== ClarityStatus.Initialized) {
      this.logDebug(
        "sendBaseMetadataIfNeeded called but Clarity is not initialized."
      );
      return;
    }

    // Identify session
    const userId = this.getUserId() || "";
    const sessionId = this.getSessionId();
    const screenName = this.getScreenName();
    const userName = this.getUserName();

    if (userId || sessionId || screenName || userName) {
      this.logDebug(
        `Identifying session: userId=${userId}, sessionId=${sessionId}, screenName=${screenName}, userName=${userName}`
      );
      Clarity.identify(userId, sessionId, screenName, userName);
    }

    // Set other tags
    const appName = this.getAppName();
    if (appName) {
      this.logDebug(`Setting tag appName=${appName}`);
      Clarity.setTag("appName", appName);
    }

    const environment = this.getEnvironment();
    if (environment) {
      this.logDebug(`Setting tag environment=${environment}`);
      Clarity.setTag("environment", environment);
    }

    const userEmail = this.getUserEmail();
    if (userEmail) {
      this.logDebug(`Setting tag userEmail=${userEmail}`);
      Clarity.setTag("userEmail", userEmail);
    }

    this.baseMetadataSent = true;
  }

  private applySessionTagsIfNeeded(): void {
    if (this.sessionTagsApplied) {
      return;
    }
    if (this.clarityStatus !== ClarityStatus.Initialized) {
      this.logDebug(
        "applySessionTagsIfNeeded called but Clarity is not initialized."
      );
      return;
    }

    const raw = this.context.parameters.sessionTagsJson.raw;
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      Object.entries(parsed).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key) {
          this.logDebug(`Applying session tag ${key}=${String(value)}`);
          Clarity.setTag(key, String(value));
        }
      });
      this.sessionTagsApplied = true;
    } catch (e: unknown) {
      this.logDebug(
        `Failed to parse sessionTagsJson: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  // Only track changes in screenName after initialization.

  private updateScreenNameIfChanged(): void {
    if (this.clarityStatus !== ClarityStatus.Initialized) {
      this.logDebug(
        "updateScreenNameIfChanged called but Clarity is not initialized."
      );
      return;
    }

    const currentScreenName = this.getScreenName();
    if (!currentScreenName) {
      return;
    }

    if (currentScreenName !== this.lastScreenName) {
      this.logDebug(
        `Updating screenName: ${this.lastScreenName} -> ${currentScreenName}`
      );
      const userId = this.getUserId() || "";
      const sessionId = this.getSessionId();
      const userName = this.getUserName();
      Clarity.identify(userId, sessionId, currentScreenName, userName);

      this.lastScreenName = currentScreenName;
    }
  }

  // ------------- events -------------

  // Sends a custom Clarity event when eventTriggerToken changes.

  private processEventIfTriggered(): void {
    if (this.clarityStatus !== ClarityStatus.Initialized) {
      this.logDebug(
        "processEventIfTriggered called but Clarity is not initialized."
      );
      return;
    }

    const tokenParam = this.context.parameters.eventTriggerToken;
    if (
      !tokenParam ||
      tokenParam.raw === null ||
      tokenParam.raw === undefined
    ) {
      return;
    }

    const currentToken = tokenParam.raw;
    if (this.lastEventTriggerToken === currentToken) {
      return;
    }

    const eventName = this.context.parameters.eventName.raw;
    if (!eventName) {
      this.logDebug(
        "eventTriggerToken changed but eventName is empty; ignoring."
      );
      this.lastEventTriggerToken = currentToken;
      return;
    }

    const rawJson = this.context.parameters.eventDataJson.raw;
    if (rawJson) {
      try {
        // Parsed but currently unused; future implementation.
        const eventData = JSON.parse(rawJson);
      } catch (e: unknown) {
        this.logDebug(
          `Failed to parse eventDataJson: ${e instanceof Error ? e.message : e}`
        );
      }
    }

    this.logDebug(`Sending event '${eventName}' with token ${currentToken}.`);
    Clarity.event(eventName);

    this.lastEventTriggerToken = currentToken;
  }

  // ------------- defaults & helpers -------------

  private isEnabled(): boolean {
    const p = this.context.parameters.disable;
    if (!p || p.raw === null || p.raw === undefined) return true;
    return !p.raw;
  }

  private isTrackingAllowed(): boolean {
    const p = this.context.parameters.trackingAllowed;
    if (!p || p.raw === null || p.raw === undefined) return true; // optional, default ON
    return p.raw;
  }

  private isDebug(): boolean {
    const p = this.context.parameters.debugLogging;
    if (!p || p.raw === null || p.raw === undefined) return false;
    return p.raw;
  }

  private getUserId(): string | undefined {
    const fromProp = this.context.parameters.userId.raw;
    if (fromProp) return fromProp;

    const userSettings = this.context.userSettings;
    if (userSettings && userSettings.userId) {
      return userSettings.userId;
    }
    return undefined;
  }

  private getUserName(): string | undefined {
    const fromProp = this.context.parameters.userName.raw;
    if (fromProp) return fromProp;

    const userSettings = this.context.userSettings;
    if (userSettings && userSettings.userName) {
      return userSettings.userName;
    }
    return undefined;
  }

  private getUserEmail(): string | undefined {
    const fromProp = this.context.parameters.userEmail.raw;
    if (fromProp) return fromProp;

    return undefined;
  }

  private getSessionId(): string | undefined {
    const fromProp = this.context.parameters.sessionId.raw;
    if (fromProp) return fromProp;

    return undefined;
  }

  private getScreenName(): string | undefined {
    const fromProp = this.context.parameters.screenName.raw;
    if (fromProp) return fromProp;

    const path = window.location.pathname || "";
    const hash = window.location.hash || "";
    const combined = (path + hash).trim();
    return combined || undefined;
  }

  private getAppName(): string | undefined {
    const fromProp = this.context.parameters.appName.raw;
    if (fromProp) return fromProp;

    const path = window.location.pathname || "";
    const segments = path.split("/").filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
    return undefined;
  }

  private getEnvironment(): string | undefined {
    const fromProp = this.context.parameters.environment.raw;
    if (fromProp) return fromProp;

    const host = window.location.hostname.toLowerCase();
    if (host.includes("dev")) return "DEV";
    if (host.includes("test") || host.includes("uat")) return "TEST";
    if (host.includes("prod")) return "PROD";

    return undefined;
  }

  private logDebug(message: string): void {
    if (this.isDebug()) {
      console.log(this.LOG_PREFIX, message);
    }
  }
}
