import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { WALLET_ICONS } from "./wallet-icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";
import { chain, WALLET_ADD_CHAIN } from "./config";
import { errorText, short } from "./format";

const svgSrc = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Switch the wallet to the project chain; add it (EIP-3085) when the wallet does not know it, then switch again. */
export async function ensureChain(connector: Connector | undefined, switchChainAsync: (a: { chainId: number }) => Promise<unknown>) {
  try {
    await switchChainAsync({ chainId: chain.id });
    return;
  } catch (error) {
    const e = error as { code?: number; cause?: { code?: number }; message?: string };
    const code = e?.code ?? e?.cause?.code;
    const unknownChain = code === 4902 || /unrecognized chain|unknown chain|not added|4902/i.test(e?.message ?? "");
    if (!unknownChain || !connector) throw error;
  }
  const provider = (await connector.getProvider()) as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
  await provider.request({ method: "wallet_addEthereumChain", params: [WALLET_ADD_CHAIN] });
  await switchChainAsync({ chainId: chain.id });
}

/** The connect control and its sheet: the site's own type and colors, the network's structure. */
export function ConnectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const setOpen = onOpenChange;
  const mobile = isMobileBrowser();
  const { address, isConnected, connector, chainId } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstRow = useRef<HTMLButtonElement | HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", onKey);
    firstRow.current?.focus();
    const main = document.getElementById("main");
    main?.setAttribute("inert", "");
    return () => {
      removeEventListener("keydown", onKey);
      main?.removeAttribute("inert");
      trigger.current?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);

  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")].filter(
    (c) => !(c.id === "injected" && named),
  );
  const label = (c: Connector) =>
    c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name;
  const icon = (c: Connector) => c.icon ?? (WALLET_ICONS[c.id] ? svgSrc(WALLET_ICONS[c.id]) : undefined);

  const pick = async (c: Connector) => {
    setNote(null);
    try {
      await connectAsync({ connector: c });
    } catch (error) {
      setNote(errorText(error));
    }
  };

  if (isConnected && address) {
    const wrong = chainId !== chain.id;
    return (
      <div className="wallet">
        {wrong ? (
          <button
            className="cta"
            disabled={switching}
            onClick={() =>
              ensureChain(connector, switchChainAsync).catch((e) => setNote(errorText(e)))
            }
          >
            {switching ? "Switching…" : `Switch to ${chain.name}`}
          </button>
        ) : (
          <button className="cta ghost" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
            <span className="mono">{short(address)}</span>
          </button>
        )}
        {menu && (
          <div className="menu" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); disconnect(); }}>Disconnect</button>
          </div>
        )}
        {note && <p className="note" role="status">{note}</p>}
      </div>
    );
  }

  return (
    <>
      <button ref={trigger} className="cta" onClick={() => setOpen(true)}>Connect</button>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 id="sheet-title">Connect a wallet</h2>
              <button className="x" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            {mobile &&
              OPEN_IN.map((w, i) => (
                <a key={w.id} ref={i === 0 ? (firstRow as React.RefObject<HTMLAnchorElement>) : undefined} className="row" href={w.href(location.href)}>
                  <span className="ic">{WALLET_ICONS[w.id] ? <img width={28} height={28} src={svgSrc(WALLET_ICONS[w.id])} alt="" /> : w.name[0]}</span>
                  <span>Open in {w.name}</span>
                </a>
              ))}
            {listed
              .filter((c) => !mobile || c.type !== "injected")
              .map((c, i) => (
                <button
                  key={c.uid}
                  ref={!mobile && i === 0 ? (firstRow as React.RefObject<HTMLButtonElement>) : undefined}
                  className="row"
                  onClick={() => pick(c)}
                  disabled={isPending}
                >
                  <span className="ic">{icon(c) ? <img width={28} height={28} src={icon(c)} alt="" /> : label(c)[0]}</span>
                  <span>
                    {label(c)}
                    {isPending && variables?.connector === c ? " · opening…" : ""}
                  </span>
                </button>
              ))}
            <p className="note" role="status">{note ?? ""}</p>
          </div>
        </div>
      )}
    </>
  );
}
