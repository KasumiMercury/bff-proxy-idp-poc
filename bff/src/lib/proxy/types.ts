export type ContentRewriteContext = {
  upstreamBase: URL;
  proxyPrefix: string;
  clientOrigin: string;
  contentType: string;
};

export type HeaderProcessingOverrides = Partial<
  Omit<
    HeaderProcessingOptions,
    "customHopByHopHeaders" | "customHeaders" | "removeHeaders"
  >
> & {
  customHopByHopHeaders?: string[];
  removeHeaders?: string[];
  customHeaders?: Record<string, string | null | undefined>;
};

export type ContentRewriteOverrides = Partial<
  Omit<ContentRewriteOptions, "htmlRewritePatterns" | "contentTypeOverrides">
> & {
  htmlRewritePatterns?: string[];
  contentTypeOverrides?: Record<string, boolean | null | undefined>;
};

export type DebugOverrides = Partial<DebugOptions>;

export type ProxyConfigurationOverrides = {
  headers?: HeaderProcessingOverrides;
  content?: ContentRewriteOverrides;
  debug?: DebugOverrides;
};

export type ProxyOptions = {
  pathSegments?: string[];
  proxyPrefix?: string;
  config?: ProxyConfigurationOverrides;
};

export type HeaderProcessingOptions = {
  enableForwardedHeaders: boolean;
  enableHopByHopFiltering: boolean;
  customHopByHopHeaders: string[];
  forwardedHeadersPolicy: "preserve" | "override" | "append";
  customHeaders: Record<string, string>;
  removeHeaders: string[];
};

export type ContentRewriteOptions = {
  enableHtmlRewriting: boolean;
  enableJsonRewriting: boolean;
  enableAbsoluteUrlRewriting: boolean;
  htmlRewritePatterns: string[];
  contentTypeOverrides: Record<string, boolean>;
};

export type DebugOptions = {
  enableRequestLogging: boolean;
  enableResponseLogging: boolean;
  enableHeaderTracing: boolean;
  enableContentTracing: boolean;
  logLevel: "none" | "basic" | "detailed" | "verbose";
};

export type ProxyConfiguration = {
  headers: HeaderProcessingOptions;
  content: ContentRewriteOptions;
  debug: DebugOptions;
};
