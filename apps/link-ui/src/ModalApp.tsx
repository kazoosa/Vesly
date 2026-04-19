import { useEffect, useReducer, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { reducer, initialState, type ScreenName } from "./state/linkMachine";
import { api } from "./api";
import { IntroScreen } from "./screens/IntroScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { InstitutionScreen } from "./screens/InstitutionScreen";
import { CredentialsScreen } from "./screens/CredentialsScreen";
import { MfaScreen } from "./screens/MfaScreen";
import { AccountsScreen } from "./screens/AccountsScreen";
import { ConsentScreen } from "./screens/ConsentScreen";
import { SuccessScreen } from "./screens/SuccessScreen";
import { ErrorScreen } from "./screens/ErrorScreen";
import { emit } from "./events";

export function ModalApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) {
      setFatal("Missing link_token in URL");
      return;
    }
    api
      .session(token)
      .then((s) => {
        dispatch({
          type: "SESSION_READY",
          sessionId: s.session_id,
          clientName: s.client_name,
          products: s.products,
        });
        emit("OPEN", { session_id: s.session_id });
        setReady(true);
      })
      .catch((err) => setFatal(err?.body?.error_message ?? "Unable to start link session"));
  }, []);

  if (fatal) {
    return (
      <Shell>
        <ErrorScreen message={fatal} onRetry={() => window.location.reload()} onExit={() => emit("EXIT")} />
      </Shell>
    );
  }
  if (!ready) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <AnimatePresence mode="wait" custom={state.direction}>
        <motion.div
          key={state.screen}
          custom={state.direction}
          initial={{ x: state.direction * 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: state.direction * -40, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex-1 flex flex-col"
        >
          {renderScreen(state.screen, state, dispatch)}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full min-h-screen flex items-center justify-center p-3 sm:p-6">
      <div className="fl-card">
        <Header />
        {children}
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-md bg-gradient-to-br from-accent-green to-emerald-700 inline-flex items-center justify-center text-bg-base text-xs font-bold">
          $
        </span>
        <span className="font-semibold text-white">All Accounts</span>
      </div>
      <button
        aria-label="Close"
        className="text-slate-500 hover:text-slate-200 text-xl leading-none"
        onClick={() => emit("EXIT")}
      >
        ×
      </button>
    </div>
  );
}

function Footer() {
  return (
    <div className="px-6 py-3 border-t border-border-subtle text-[11px] text-slate-500 text-center">
      Secured with 256-bit encryption · Credentials never stored
    </div>
  );
}

function renderScreen(
  screen: ScreenName,
  state: ReturnType<typeof initialState extends infer T ? () => T : never> | typeof initialState,
  dispatch: React.Dispatch<import("./state/linkMachine").Action>,
): React.ReactNode {
  switch (screen) {
    case "intro":
      return (
        <IntroScreen
          clientName={state.clientName}
          products={state.products}
          onContinue={() => dispatch({ type: "GO", screen: "search" })}
        />
      );
    case "search":
      return (
        <SearchScreen
          onPick={async (inst) => {
            dispatch({ type: "PICK_INSTITUTION", institution: inst });
            await api.selectInstitution(state.sessionId!, inst.id);
            emit("SELECT_INSTITUTION", { institution_id: inst.id });
            dispatch({ type: "GO", screen: "institution" });
          }}
        />
      );
    case "institution":
      return (
        <InstitutionScreen
          institution={state.selectedInstitution!}
          products={state.products}
          onContinue={() => dispatch({ type: "GO", screen: "credentials" })}
          onBack={() => dispatch({ type: "GO", screen: "search", direction: -1 })}
        />
      );
    case "credentials":
      return (
        <CredentialsScreen
          institution={state.selectedInstitution!}
          onBack={() => dispatch({ type: "GO", screen: "institution", direction: -1 })}
          onSubmit={async (username, password) => {
            try {
              const res = await api.submitCredentials(state.sessionId!, username, password);
              emit("SUBMIT_CREDENTIALS");
              dispatch({ type: "GO", screen: res.mfa_required ? "mfa" : "accounts" });
            } catch (err) {
              const msg = (err as { body?: { error_code?: string } })?.body?.error_code ?? "INVALID_CREDENTIALS";
              if (msg === "INVALID_CREDENTIALS") {
                dispatch({ type: "FAIL", message: "Those credentials don't seem right. Try user_good." });
                emit("ERROR", { code: msg });
              }
            }
          }}
        />
      );
    case "mfa":
      return (
        <MfaScreen
          institution={state.selectedInstitution!}
          onBack={() => dispatch({ type: "GO", screen: "credentials", direction: -1 })}
          onSubmit={async (code) => {
            try {
              await api.submitMfa(state.sessionId!, code);
              emit("SUBMIT_MFA");
              dispatch({ type: "GO", screen: "accounts" });
            } catch {
              dispatch({ type: "FAIL", message: "That code is incorrect. Try 123456 in sandbox." });
            }
          }}
        />
      );
    case "accounts":
      return (
        <AccountsScreen
          sessionId={state.sessionId!}
          onBack={() => dispatch({ type: "GO", screen: "credentials", direction: -1 })}
          onContinue={(ids) => {
            dispatch({ type: "SET_ACCOUNTS", ids });
            dispatch({ type: "GO", screen: "consent" });
          }}
        />
      );
    case "consent":
      return (
        <ConsentScreen
          clientName={state.clientName}
          products={state.products}
          institution={state.selectedInstitution!}
          onBack={() => dispatch({ type: "GO", screen: "accounts", direction: -1 })}
          onConfirm={async () => {
            try {
              const res = await api.finalize(state.sessionId!, state.selectedAccountIds);
              emit("HANDOFF", { public_token: res.public_token });
              dispatch({ type: "SUCCEED", publicToken: res.public_token });
              emit("SUCCESS", {
                public_token: res.public_token,
                metadata: {
                  institution: state.selectedInstitution,
                  accounts: state.selectedAccountIds,
                },
              });
            } catch (err) {
              dispatch({ type: "FAIL", message: (err as Error).message });
            }
          }}
        />
      );
    case "success":
      return (
        <SuccessScreen
          institution={state.selectedInstitution!}
          publicToken={state.publicToken!}
          onDone={() => emit("EXIT")}
        />
      );
    case "error":
      return (
        <ErrorScreen
          message={state.errorMessage ?? "Something went wrong"}
          onRetry={() => dispatch({ type: "GO", screen: "search" })}
          onExit={() => emit("EXIT")}
        />
      );
  }
}
