export interface LoginContextView {
  id: string;
  clientId: string;
  scopes: string[];
  loginHint?: string;
}
