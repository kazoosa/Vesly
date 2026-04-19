export type ScreenName =
  | "intro"
  | "search"
  | "institution"
  | "credentials"
  | "mfa"
  | "accounts"
  | "consent"
  | "success"
  | "error";

export interface LinkState {
  screen: ScreenName;
  direction: 1 | -1;
  sessionId: string | null;
  clientName: string;
  products: string[];
  selectedInstitution: null | { id: string; name: string; primaryColor: string };
  selectedAccountIds: string[];
  publicToken: string | null;
  errorMessage: string | null;
}

export const initialState: LinkState = {
  screen: "intro",
  direction: 1,
  sessionId: null,
  clientName: "",
  products: [],
  selectedInstitution: null,
  selectedAccountIds: [],
  publicToken: null,
  errorMessage: null,
};

export type Action =
  | { type: "GO"; screen: ScreenName; direction?: 1 | -1 }
  | { type: "SESSION_READY"; sessionId: string; clientName: string; products: string[] }
  | { type: "PICK_INSTITUTION"; institution: { id: string; name: string; primaryColor: string } }
  | { type: "SET_ACCOUNTS"; ids: string[] }
  | { type: "SUCCEED"; publicToken: string }
  | { type: "FAIL"; message: string };

export function reducer(state: LinkState, action: Action): LinkState {
  switch (action.type) {
    case "GO":
      return { ...state, screen: action.screen, direction: action.direction ?? 1 };
    case "SESSION_READY":
      return {
        ...state,
        sessionId: action.sessionId,
        clientName: action.clientName,
        products: action.products,
      };
    case "PICK_INSTITUTION":
      return { ...state, selectedInstitution: action.institution };
    case "SET_ACCOUNTS":
      return { ...state, selectedAccountIds: action.ids };
    case "SUCCEED":
      return { ...state, publicToken: action.publicToken, screen: "success", direction: 1 };
    case "FAIL":
      return { ...state, errorMessage: action.message, screen: "error", direction: 1 };
    default:
      return state;
  }
}
