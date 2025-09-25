export type ProxyOptions = {
  pathSegments: string[];
  proxyPrefix: string;
  config?: ProxyConfiguration;
};

export type ProxyConfig = {
  upstreamBase: URL;
  proxyPrefix: string;
  clientOrigin: string;
};

export type ContentRewriteContext = {
  upstreamBase: URL;
  proxyPrefix: string;
  clientOrigin: string;
  contentType: string;
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
