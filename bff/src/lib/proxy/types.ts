export type ProxyOptions = {
  pathSegments: string[];
  proxyPrefix: string;
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
