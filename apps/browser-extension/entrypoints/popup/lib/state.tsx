import {
  backgroundToPopupResponseSchema,
  type PopupState,
  type PopupToBackground,
} from "@/lib/messaging";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Send a typed message to the background worker and validate the response.
 * Errors are surfaced via the returned discriminated union so callers can
 * branch on success/error without throwing.
 */
export async function sendToBackground(
  message: PopupToBackground,
): Promise<{ ok: true; state: PopupState } | { ok: true } | { ok: false; error: string }> {
  const raw = await browser.runtime.sendMessage(message);
  const parsed = backgroundToPopupResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid response from background" };
  }
  switch (parsed.data.kind) {
    case "state":
      return { ok: true, state: parsed.data.state };
    case "ok":
      return { ok: true };
    case "error":
      return { ok: false, error: parsed.data.message };
  }
}

interface PopupStateContextValue {
  state: PopupState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  dispatch: (
    message: PopupToBackground,
  ) => Promise<{ ok: true; state: PopupState } | { ok: true } | { ok: false; error: string }>;
}

const PopupStateContext = createContext<PopupStateContextValue | null>(null);

export function PopupStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PopupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await sendToBackground({ kind: "getState" });
    if ("state" in res) {
      setState(res.state);
      setError(null);
    } else if (!res.ok) {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  const dispatch = useCallback<PopupStateContextValue["dispatch"]>(async (message) => {
    const res = await sendToBackground(message);
    if ("state" in res) {
      setState(res.state);
      setError(null);
    } else if (!res.ok) {
      setError(res.error);
    }
    return res;
  }, []);

  useEffect(() => {
    void refresh();
    const handler = (changes: Record<string, unknown>): void => {
      if (Object.keys(changes).length > 0) void refresh();
    };
    browser.storage.local.onChanged.addListener(handler);
    return () => {
      browser.storage.local.onChanged.removeListener(handler);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ state, loading, error, refresh, dispatch }),
    [state, loading, error, refresh, dispatch],
  );

  return <PopupStateContext.Provider value={value}>{children}</PopupStateContext.Provider>;
}

export function usePopupState(): PopupStateContextValue {
  const ctx = useContext(PopupStateContext);
  if (!ctx) throw new Error("usePopupState must be used inside PopupStateProvider");
  return ctx;
}
